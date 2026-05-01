-- Flags globais do painel administrativo

CREATE TABLE IF NOT EXISTS public.global_feature_flags (
  flag_key text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.global_feature_flags IS
  'Flags globais para habilitar/desabilitar recursos visuais e operacionais controlados pelo admin global.';

COMMENT ON COLUMN public.global_feature_flags.flag_key IS
  'Chave única da flag global (ex.: whatsapp_show_automation_panels).';

CREATE OR REPLACE FUNCTION public.set_global_feature_flags_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_feature_flags_updated_at ON public.global_feature_flags;
CREATE TRIGGER trg_global_feature_flags_updated_at
BEFORE UPDATE ON public.global_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.set_global_feature_flags_updated_at();

ALTER TABLE public.global_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_feature_flags_read_authenticated" ON public.global_feature_flags;
CREATE POLICY "global_feature_flags_read_authenticated"
ON public.global_feature_flags
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "global_feature_flags_manage_global_admin" ON public.global_feature_flags;
CREATE POLICY "global_feature_flags_manage_global_admin"
ON public.global_feature_flags
FOR ALL
TO authenticated
USING (public.auth_is_global_admin())
WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_feature_flags_service_role_all" ON public.global_feature_flags;
CREATE POLICY "global_feature_flags_service_role_all"
ON public.global_feature_flags
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

INSERT INTO public.global_feature_flags (flag_key, is_enabled)
VALUES ('whatsapp_show_automation_panels', false)
ON CONFLICT (flag_key) DO NOTHING;
