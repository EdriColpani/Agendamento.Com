-- FASE 4 — Instâncias WhatsApp por empresa (Evolution Community / multi-tenant)
-- Uma sessão Evolution por company_id. Sem secrets nesta tabela.

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_name text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'evolution'
    CHECK (provider IN ('evolution')),
  status text NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (status IN ('CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR')),
  connected_phone text,
  connected_at timestamptz,
  last_activity_at timestamptz,
  last_disconnected_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_status
  ON public.whatsapp_instances (status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_provider
  ON public.whatsapp_instances (provider);

COMMENT ON TABLE public.whatsapp_instances IS
'Instância WhatsApp (Evolution/Baileys) isolada por empresa. Secrets ficam na Edge Function / env.';

COMMENT ON COLUMN public.whatsapp_instances.instance_name IS
'Nome único na Evolution API (ex.: pa-<uuid-sem-hifens>).';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_whatsapp_instance_name(p_company_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'pa-' || lower(replace(p_company_id::text, '-', ''));
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_whatsapp_instance(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = p_company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_whatsapp_instances_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER trg_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_whatsapp_instances_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: garantir instância (1 por empresa)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_whatsapp_instance(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.whatsapp_instances%ROWTYPE;
  v_instance_name text;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_id obrigatório');
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT public.user_can_manage_whatsapp_instance(p_company_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para gerenciar WhatsApp desta empresa');
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.whatsapp_instances wi
  WHERE wi.company_id = p_company_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'instance', row_to_json(v_row)::jsonb
    );
  END IF;

  v_instance_name := public.generate_whatsapp_instance_name(p_company_id);

  INSERT INTO public.whatsapp_instances (
    company_id,
    instance_name,
    provider,
    status
  )
  VALUES (
    p_company_id,
    v_instance_name,
    'evolution',
    'DISCONNECTED'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'instance', row_to_json(v_row)::jsonb
  );
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_row
  FROM public.whatsapp_instances wi
  WHERE wi.company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'created', false,
    'instance', row_to_json(v_row)::jsonb
  );
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------------------------------------------------------------------------
-- RPC: leitura segura (sem secrets)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_whatsapp_instance(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.whatsapp_instances%ROWTYPE;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_id obrigatório');
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = p_company_id AND uc.user_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Sem acesso a esta empresa');
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.whatsapp_instances wi
  WHERE wi.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'instance', null);
  END IF;

  RETURN jsonb_build_object('success', true, 'instance', row_to_json(v_row)::jsonb);
END;
$function$;

-- ---------------------------------------------------------------------------
-- RPC: atualização de status (service role / Edge Functions)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_whatsapp_instance_status(
  p_company_id uuid,
  p_status text,
  p_connected_phone text DEFAULT NULL,
  p_last_error text DEFAULT NULL,
  p_metadata_patch jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.whatsapp_instances%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas service_role');
  END IF;

  IF p_status NOT IN ('CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'status inválido');
  END IF;

  UPDATE public.whatsapp_instances wi
  SET
    status = p_status,
    connected_phone = CASE
      WHEN p_status = 'CONNECTED' THEN COALESCE(p_connected_phone, wi.connected_phone)
      WHEN p_status IN ('DISCONNECTED', 'ERROR') THEN NULL
      ELSE wi.connected_phone
    END,
    connected_at = CASE
      WHEN p_status = 'CONNECTED' AND wi.connected_at IS NULL THEN v_now
      WHEN p_status = 'CONNECTED' THEN wi.connected_at
      ELSE wi.connected_at
    END,
    last_disconnected_at = CASE
      WHEN p_status IN ('DISCONNECTED', 'ERROR') THEN v_now
      ELSE wi.last_disconnected_at
    END,
    last_activity_at = v_now,
    last_error = p_last_error,
    last_error_at = CASE WHEN p_last_error IS NOT NULL THEN v_now ELSE wi.last_error_at END,
    metadata = CASE
      WHEN p_metadata_patch IS NOT NULL THEN wi.metadata || p_metadata_patch
      ELSE wi.metadata
    END
  WHERE wi.company_id = p_company_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Instância não encontrada');
  END IF;

  RETURN jsonb_build_object('success', true, 'instance', row_to_json(v_row)::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_whatsapp_instance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_instance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_whatsapp_instance_status(uuid, text, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_instances_select_company_members ON public.whatsapp_instances;
CREATE POLICY whatsapp_instances_select_company_members
ON public.whatsapp_instances
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = whatsapp_instances.company_id
      AND uc.user_id = auth.uid()
  )
);

-- INSERT/UPDATE/DELETE: apenas RPC SECURITY DEFINER ou service_role (sem policy direta)
