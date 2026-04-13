-- Faixas de preço por horário (dia da semana + intervalo) por quadra.
-- Fallback: courts.default_slot_price. RPCs de reserva somam preço por slot alinhado à duração do slot.

CREATE TABLE IF NOT EXISTS public.court_slot_price_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_price NUMERIC(12, 2) NOT NULL CHECK (slot_price >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT court_slot_price_bands_time_order CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_court_slot_price_bands_court_day
  ON public.court_slot_price_bands(court_id, day_of_week);

COMMENT ON TABLE public.court_slot_price_bands IS
  'Preço por slot (mesma unidade de slot_duration_minutes da quadra) para início do slot em [start_time, end_time) no day_of_week (0=domingo … 6=sábado).';

COMMENT ON COLUMN public.court_slot_price_bands.sort_order IS
  'Desempate quando faixas se sobrepõem: menor valor tem prioridade.';

CREATE OR REPLACE FUNCTION public.set_court_slot_price_bands_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_slot_price_bands_updated_at ON public.court_slot_price_bands;
CREATE TRIGGER trg_court_slot_price_bands_updated_at
  BEFORE UPDATE ON public.court_slot_price_bands
  FOR EACH ROW
  EXECUTE FUNCTION public.set_court_slot_price_bands_updated_at();

ALTER TABLE public.court_slot_price_bands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_view_court_slot_price_bands" ON public.court_slot_price_bands;
DROP POLICY IF EXISTS "authenticated_users_can_insert_court_slot_price_bands" ON public.court_slot_price_bands;
DROP POLICY IF EXISTS "authenticated_users_can_update_court_slot_price_bands" ON public.court_slot_price_bands;
DROP POLICY IF EXISTS "authenticated_users_can_delete_court_slot_price_bands" ON public.court_slot_price_bands;

CREATE POLICY "authenticated_users_can_view_court_slot_price_bands"
ON public.court_slot_price_bands FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_slot_price_bands.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE POLICY "authenticated_users_can_insert_court_slot_price_bands"
ON public.court_slot_price_bands FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_slot_price_bands.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE POLICY "authenticated_users_can_update_court_slot_price_bands"
ON public.court_slot_price_bands FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_slot_price_bands.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_slot_price_bands.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE POLICY "authenticated_users_can_delete_court_slot_price_bands"
ON public.court_slot_price_bands FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_slot_price_bands.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE OR REPLACE FUNCTION public.resolve_court_slot_price(
  p_court_id uuid,
  p_date date,
  p_slot_start time
) RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT pb.slot_price
      FROM public.court_slot_price_bands pb
      WHERE pb.court_id = p_court_id
        AND pb.day_of_week = EXTRACT(DOW FROM p_date)::int
        AND p_slot_start >= pb.start_time
        AND p_slot_start < pb.end_time
      ORDER BY pb.sort_order, pb.start_time
      LIMIT 1
    ),
    (SELECT COALESCE(ct.default_slot_price, 0::numeric) FROM public.courts ct WHERE ct.id = p_court_id)
  );
$$;

COMMENT ON FUNCTION public.resolve_court_slot_price(uuid, date, time) IS
  'Preço de um slot cujo início é p_slot_start na data p_date; faixa [start,end) ou default_slot_price.';

CREATE OR REPLACE FUNCTION public.compute_court_booking_total_price(
  p_court_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_minutes integer
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_slot int;
  v_sum numeric(12, 2) := 0;
  ts timestamp;
  ts_end timestamp;
BEGIN
  SELECT COALESCE(ct.slot_duration_minutes, 60) INTO v_slot
  FROM public.courts ct WHERE ct.id = p_court_id;

  IF v_slot IS NULL OR v_slot < 1 THEN
    v_slot := 60;
  END IF;

  ts := p_appointment_date + p_appointment_time;
  ts_end := ts + make_interval(mins => p_duration_minutes);

  WHILE ts < ts_end LOOP
    v_sum := v_sum + COALESCE(
      public.resolve_court_slot_price(p_court_id, ts::date, ts::time),
      0::numeric
    );
    ts := ts + make_interval(mins => v_slot);
  END LOOP;

  RETURN round(v_sum, 2);
END;
$$;

COMMENT ON FUNCTION public.compute_court_booking_total_price(uuid, date, time, integer) IS
  'Soma resolve_court_slot_price para cada início de slot (passo slot_duration) coberto pela reserva.';

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
            'default_slot_price', ct.default_slot_price,
            'has_price_bands', EXISTS (
              SELECT 1 FROM public.court_slot_price_bands pb WHERE pb.court_id = ct.id
            )
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
  'Lista quadras ativas; has_price_bands indica faixas cadastradas.';

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
    AND COALESCE(a.status, '') <> 'cancelado';

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

COMMENT ON FUNCTION public.get_court_public_day_view(uuid, uuid, date) IS
  'Janela do dia, ocupação e faixas de preço (price_bands) para a data.';

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
  'Reserva pública; total_price pela soma de faixas (compute_court_booking_total_price).';

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
  'booking_kind=court; total_price soma faixas horárias (compute_court_booking_total_price).';

REVOKE ALL ON FUNCTION public.resolve_court_slot_price(uuid, date, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_court_booking_total_price(uuid, date, time, integer) FROM PUBLIC;
