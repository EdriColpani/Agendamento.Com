-- Libera slot de quadra após finalização: status 'concluido' deixa de bloquear ocupação/conflito.

CREATE OR REPLACE FUNCTION public.is_court_slot_blocking_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(lower(trim(p_status)), '') NOT IN ('cancelado', 'concluido');
$$;

COMMENT ON FUNCTION public.is_court_slot_blocking_status(text) IS
  'Retorna true quando status deve bloquear slot de quadra (hoje: tudo exceto cancelado e concluido).';

-- Índice de conflito alinhado à regra de bloqueio atual.
DROP INDEX IF EXISTS public.idx_appointments_court_date_active_court_booking;

CREATE INDEX IF NOT EXISTS idx_appointments_court_date_active_court_booking
  ON public.appointments (court_id, appointment_date)
  WHERE booking_kind = 'court'
    AND court_id IS NOT NULL
    AND public.is_court_slot_blocking_status(status);

COMMENT ON INDEX public.idx_appointments_court_date_active_court_booking IS
  'Acelera detecção de sobreposição por quadra/dia; ignora status cancelado e concluido.';

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
  v_bands jsonb;
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

  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'start_time', to_char(pb.start_time, 'HH24:MI:SS'),
          'end_time', to_char(pb.end_time, 'HH24:MI:SS'),
          'slot_price', pb.slot_price
        ) ORDER BY pb.sort_order, pb.start_time
      )
      FROM public.court_slot_price_bands pb
      WHERE pb.court_id = p_court_id
        AND pb.day_of_week = v_dow
    ),
    '[]'::jsonb
  )
  INTO v_bands;

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
      'price_bands', COALESCE(v_bands, '[]'::jsonb),
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
    AND public.is_court_slot_blocking_status(a.status);

  RETURN jsonb_build_object(
    'ok', true,
    'court_name', v_court.name,
    'slot_duration_minutes', v_court.slot_duration_minutes,
    'default_slot_price', v_court.default_slot_price,
    'price_bands', COALESCE(v_bands, '[]'::jsonb),
    'day_open', true,
    'working_start', to_char(v_wh.start_time, 'HH24:MI:SS'),
    'working_end', to_char(v_wh.end_time, 'HH24:MI:SS'),
    'occupancy', COALESCE(v_occ, '[]'::jsonb)
  );
END;
$$;

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

  v_price := public.compute_court_booking_total_price(
    p_court_id,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes
  );

  v_collaborator_id := public.get_or_create_arena_system_collaborator(p_company_id);
  v_service_id := public.get_or_create_arena_system_booking_service(p_company_id);

  v_ns := EXTRACT(HOUR FROM p_appointment_time)::int * 60 + EXTRACT(MINUTE FROM p_appointment_time)::int;
  v_ne := v_ns + p_duration_minutes;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.court_id = p_court_id
      AND a.appointment_date = p_appointment_date
      AND public.is_court_slot_blocking_status(a.status)
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

  v_price := public.compute_court_booking_total_price(
    p_court_id,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes
  );

  v_collaborator_id := public.get_or_create_arena_system_collaborator(p_company_id);
  v_service_id := public.get_or_create_arena_system_booking_service(p_company_id);

  v_ns := EXTRACT(HOUR FROM p_appointment_time)::int * 60 + EXTRACT(MINUTE FROM p_appointment_time)::int;
  v_ne := v_ns + p_duration_minutes;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.court_id = p_court_id
      AND a.appointment_date = p_appointment_date
      AND public.is_court_slot_blocking_status(a.status)
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

REVOKE ALL ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_court_public_day_view(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_court_public_day_view(uuid, uuid, date) TO anon, authenticated;
