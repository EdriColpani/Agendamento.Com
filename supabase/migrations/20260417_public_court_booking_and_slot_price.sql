-- Preço sugerido por slot na quadra + RPCs públicos (anon) para listar quadras, ver ocupação do dia e reservar.

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS default_slot_price numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.courts.default_slot_price IS
  'Valor cobrado por slot (bloco slot_duration_minutes) nesta quadra; usado em reservas públicas e pode alimentar total_price.';

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
      AND COALESCE(st.scheduling_mode, 'service') = 'court'
  );
$$;

COMMENT ON FUNCTION public.company_public_court_booking_allowed(uuid) IS
  'true se a empresa existe e está em modo arena (segmento scheduling_mode = court).';

REVOKE ALL ON FUNCTION public.company_public_court_booking_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_public_court_booking_allowed(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_courts_for_booking(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arr jsonb;
BEGIN
  IF NOT public.company_public_court_booking_allowed(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Reserva pública de quadras não disponível para esta empresa.');
  END IF;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(s.j ORDER BY s.ord1, s.ord2)
      FROM (
        SELECT
          ct.display_order AS ord1,
          ct.name AS ord2,
          jsonb_build_object(
            'id', ct.id,
            'name', ct.name,
            'slot_duration_minutes', ct.slot_duration_minutes,
            'default_slot_price', ct.default_slot_price
          ) AS j
        FROM public.courts ct
        WHERE ct.company_id = p_company_id
          AND ct.is_active = true
      ) s
    ),
    '[]'::jsonb
  )
  INTO v_arr;

  RETURN jsonb_build_object('ok', true, 'courts', COALESCE(v_arr, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.list_public_courts_for_booking(uuid) IS
  'Lista quadras ativas da empresa em modo arena (uso público).';

REVOKE ALL ON FUNCTION public.list_public_courts_for_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_courts_for_booking(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_court_public_day_view(
  p_company_id uuid,
  p_court_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow int := EXTRACT(DOW FROM p_date)::int;
  v_court record;
  v_wh record;
  v_occ jsonb;
BEGIN
  IF NOT public.company_public_court_booking_allowed(p_company_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Reserva pública não disponível.');
  END IF;

  SELECT ct.id, ct.name, ct.slot_duration_minutes, ct.default_slot_price
  INTO v_court
  FROM public.courts ct
  WHERE ct.id = p_court_id
    AND ct.company_id = p_company_id
    AND ct.is_active = true;

  IF v_court.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Quadra inválida ou inativa.');
  END IF;

  SELECT wh.start_time, wh.end_time, wh.is_active
  INTO v_wh
  FROM public.court_working_hours wh
  WHERE wh.court_id = p_court_id
    AND wh.day_of_week = v_dow;

  IF v_wh IS NULL OR v_wh.is_active = false THEN
    RETURN jsonb_build_object(
      'ok', true,
      'court_name', v_court.name,
      'slot_duration_minutes', v_court.slot_duration_minutes,
      'default_slot_price', v_court.default_slot_price,
      'day_open', false,
      'working_start', null,
      'working_end', null,
      'occupancy', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'appointment_time', to_char(a.appointment_time, 'HH24:MI:SS'),
        'total_duration_minutes', COALESCE(a.total_duration_minutes, 60)
      )
    ),
    '[]'::jsonb
  )
  INTO v_occ
  FROM public.appointments a
  WHERE a.company_id = p_company_id
    AND a.court_id = p_court_id
    AND a.appointment_date = p_date
    AND COALESCE(a.status, '') <> 'cancelado';

  RETURN jsonb_build_object(
    'ok', true,
    'court_name', v_court.name,
    'slot_duration_minutes', v_court.slot_duration_minutes,
    'default_slot_price', v_court.default_slot_price,
    'day_open', true,
    'working_start', to_char(v_wh.start_time, 'HH24:MI:SS'),
    'working_end', to_char(v_wh.end_time, 'HH24:MI:SS'),
    'occupancy', COALESCE(v_occ, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_court_public_day_view(uuid, uuid, date) IS
  'Retorna janela do dia e ocupação para montar grade pública de slots.';

REVOKE ALL ON FUNCTION public.get_court_public_day_view(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_court_public_day_view(uuid, uuid, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_court_booking_public(
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
  v_id uuid;
  v_ns int;
  v_ne int;
  v_collaborator_id uuid;
  v_service_id uuid;
  v_price numeric(12, 2);
BEGIN
  IF NOT public.company_public_court_booking_allowed(p_company_id) THEN
    RAISE EXCEPTION 'Reserva pública não disponível para esta empresa';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE cl.id = p_client_id AND cl.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = p_court_id AND ct.company_id = p_company_id AND ct.is_active = true
  ) THEN
    RAISE EXCEPTION 'Quadra inválida ou inativa';
  END IF;

  SELECT COALESCE(ct.default_slot_price, 0) INTO v_price
  FROM public.courts ct
  WHERE ct.id = p_court_id;

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
    v_price,
    NULLIF(trim(COALESCE(p_observations, '')), ''),
    NULL,
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

COMMENT ON FUNCTION public.create_court_booking_public IS
  'Cria reserva de quadra sem usuário logado (cliente já existente na empresa). Usa default_slot_price da quadra.';

REVOKE ALL ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text) TO anon, authenticated;

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
  v_price numeric(12, 2);
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

  SELECT COALESCE(ct.default_slot_price, 0) INTO v_price
  FROM public.courts ct
  WHERE ct.id = p_court_id;

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
    v_price,
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
  'Cria agendamento booking_kind=court; total_price a partir de courts.default_slot_price.';
