-- Serviço genérico por empresa para reservas de quadra (vínculo em appointment_services),
-- evitando listagens com "Serviço(s) Desconhecido(s)" quando booking_kind = court.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_arena_system_service_placeholder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.services.is_arena_system_service_placeholder IS
  'true = serviço técnico "Agendamento" usado em reservas de quadra; não é oferta comercial.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_one_arena_placeholder_per_company
  ON public.services (company_id)
  WHERE is_arena_system_service_placeholder = true;

CREATE OR REPLACE FUNCTION public.get_or_create_arena_system_booking_service(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('arena_sys_svc:' || p_company_id::text));

  SELECT s.id INTO v_id
  FROM public.services s
  WHERE s.company_id = p_company_id
    AND s.is_arena_system_service_placeholder = true
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.services (
    company_id,
    name,
    description,
    price,
    duration_minutes,
    category,
    status,
    is_arena_system_service_placeholder
  ) VALUES (
    p_company_id,
    'Agendamento',
    'Uso interno: reserva de quadra / arena.',
    0,
    1,
    'Sistema',
    'Ativo',
    true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT s.id INTO v_id
    FROM public.services s
    WHERE s.company_id = p_company_id
      AND s.is_arena_system_service_placeholder = true
    LIMIT 1;
    IF v_id IS NULL THEN
      RAISE;
    END IF;
    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_arena_system_booking_service(uuid) IS
  'Retorna (criando se necessário) o serviço genérico da empresa para agendamentos de quadra.';

REVOKE ALL ON FUNCTION public.get_or_create_arena_system_booking_service(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_court_booking(
  p_company_id uuid,
  p_court_id uuid,
  p_client_id uuid,
  p_client_nickname text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_minutes integer,
  p_observations text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_ns int;
  v_ne int;
  v_collaborator_id uuid;
  v_service_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = v_actor
  ) AND NOT EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = p_company_id AND c.user_id = v_actor AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão nesta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = p_court_id AND ct.company_id = p_company_id AND ct.is_active = true
  ) THEN
    RAISE EXCEPTION 'Quadra inválida ou inativa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE cl.id = p_client_id AND cl.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido';
  END IF;

  v_collaborator_id := public.get_or_create_arena_system_collaborator(p_company_id);
  v_service_id := public.get_or_create_arena_system_booking_service(p_company_id);

  v_ns := EXTRACT(HOUR FROM p_appointment_time)::int * 60 + EXTRACT(MINUTE FROM p_appointment_time)::int;
  v_ne := v_ns + p_duration_minutes;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.court_id = p_court_id
      AND a.appointment_date = p_appointment_date
      AND COALESCE(a.status, '') <> 'cancelado'
      AND (
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int) < v_ne
        AND
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int
          + COALESCE(a.total_duration_minutes, 60)) > v_ns
      )
  ) THEN
    RAISE EXCEPTION 'Horário indisponível para esta quadra';
  END IF;

  INSERT INTO public.appointments (
    company_id,
    client_id,
    client_nickname,
    collaborator_id,
    appointment_date,
    appointment_time,
    total_duration_minutes,
    total_price,
    observations,
    created_by_user_id,
    status,
    booking_kind,
    court_id
  ) VALUES (
    p_company_id,
    p_client_id,
    NULLIF(trim(COALESCE(p_client_nickname, '')), ''),
    v_collaborator_id,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes,
    0,
    NULLIF(trim(COALESCE(p_observations, '')), ''),
    v_actor,
    'pendente',
    'court',
    p_court_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.appointment_services (appointment_id, service_id)
  VALUES (v_id, v_service_id);

  INSERT INTO public.collaborator_services (
    company_id,
    collaborator_id,
    service_id,
    commission_type,
    commission_value,
    active
  ) VALUES (
    p_company_id,
    v_collaborator_id,
    v_service_id,
    'PERCENT',
    0::numeric(10, 2),
    true
  )
  ON CONFLICT (collaborator_id, service_id) DO NOTHING;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_court_booking IS
  'Cria agendamento booking_kind=court com conflito validado; colaborador e serviço placeholders da empresa.';

REVOKE ALL ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) TO authenticated;
