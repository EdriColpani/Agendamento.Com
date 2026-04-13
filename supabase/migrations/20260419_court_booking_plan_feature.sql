-- Módulo arena: flag na empresa + feature + vínculo em plan_features para todos os subscription_plans + sync de flags.
-- Empresas já em segmento court recebem court_booking_enabled = true até o próximo sync de assinatura.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS court_booking_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.court_booking_enabled IS
  'Quando true, UI e rotas de gestão de quadras (além do segmento court) ficam liberadas conforme plano (plan_features court_booking).';

UPDATE public.companies co
SET court_booking_enabled = true
FROM public.segment_types st
WHERE co.segment_type = st.id
  AND COALESCE(st.scheduling_mode, 'service') = 'court';

INSERT INTO public.features (id, slug, name, description, company_flag_name, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'court_booking',
  'Reserva de quadras',
  'Módulo arena: quadras, horários, agenda, preços e reserva pública.',
  'court_booking_enabled',
  true,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.features WHERE slug = 'court_booking');

INSERT INTO public.plan_features (plan_id, feature_id, feature_limit)
SELECT p.id, f.id, NULL::integer
FROM public.subscription_plans p
CROSS JOIN public.features f
WHERE f.slug = 'court_booking'
  AND NOT EXISTS (
    SELECT 1
    FROM public.plan_features pf
    WHERE pf.plan_id = p.id AND pf.feature_id = f.id
  );

CREATE OR REPLACE FUNCTION public.sync_company_flags_from_plan(p_company_id uuid, p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  feature_flag_name text;
  flags_to_update jsonb := '{}'::jsonb;
BEGIN
  FOR feature_flag_name IN
    SELECT DISTINCT f.company_flag_name
    FROM public.plan_features pf
    JOIN public.features f ON pf.feature_id = f.id
    WHERE pf.plan_id = p_plan_id
      AND f.company_flag_name IS NOT NULL
      AND f.company_flag_name != ''
  LOOP
    flags_to_update := flags_to_update || jsonb_build_object(feature_flag_name, true);
  END LOOP;

  IF flags_to_update IS NOT NULL AND flags_to_update != '{}'::jsonb THEN
    IF flags_to_update ? 'whatsapp_messaging_enabled' THEN
      UPDATE public.companies
      SET whatsapp_messaging_enabled = (flags_to_update->>'whatsapp_messaging_enabled')::boolean
      WHERE id = p_company_id;
    END IF;

    IF flags_to_update ? 'court_booking_enabled' THEN
      UPDATE public.companies
      SET court_booking_enabled = (flags_to_update->>'court_booking_enabled')::boolean
      WHERE id = p_company_id;
    END IF;
  END IF;

  IF NOT (flags_to_update ? 'whatsapp_messaging_enabled') THEN
    UPDATE public.companies
    SET whatsapp_messaging_enabled = false
    WHERE id = p_company_id
      AND whatsapp_messaging_enabled = true;
  END IF;

  IF NOT (flags_to_update ? 'court_booking_enabled') THEN
    UPDATE public.companies
    SET court_booking_enabled = false
    WHERE id = p_company_id
      AND court_booking_enabled = true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_company_flags_from_plan(uuid, uuid) IS
  'Sincroniza flags em companies (whatsapp_messaging_enabled, court_booking_enabled) conforme plan_features do plano.';

CREATE OR REPLACE FUNCTION public.company_public_court_booking_allowed(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies co
    LEFT JOIN public.segment_types st ON st.id = co.segment_type
    WHERE co.id = p_company_id
      AND co.court_booking_enabled = true
      AND COALESCE(st.scheduling_mode, 'service') = 'court'
  );
$$;

COMMENT ON FUNCTION public.company_public_court_booking_allowed(uuid) IS
  'true se empresa em modo arena e com court_booking_enabled (plano / flag).';

REVOKE ALL ON FUNCTION public.company_public_court_booking_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_public_court_booking_allowed(uuid) TO anon, authenticated;
