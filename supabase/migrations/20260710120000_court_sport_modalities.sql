-- Modalidades de esporte por quadra + esporte gravado na reserva (opcional por quadra).

CREATE TABLE IF NOT EXISTS public.court_sport_modalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT court_sport_modalities_court_name_unique UNIQUE (court_id, name)
);

CREATE INDEX IF NOT EXISTS idx_court_sport_modalities_court_id
  ON public.court_sport_modalities(court_id);

COMMENT ON TABLE public.court_sport_modalities IS
  'Modalidades de esporte praticadas em cada quadra. Vazio = sem seleção na reserva.';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS court_sport_name text NULL;

COMMENT ON COLUMN public.appointments.court_sport_name IS
  'Modalidade de esporte escolhida na reserva de quadra (snapshot do nome).';

CREATE OR REPLACE FUNCTION public.set_court_sport_modalities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_sport_modalities_updated_at ON public.court_sport_modalities;
CREATE TRIGGER trg_court_sport_modalities_updated_at
  BEFORE UPDATE ON public.court_sport_modalities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_court_sport_modalities_updated_at();

ALTER TABLE public.court_sport_modalities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_view_court_sport_modalities" ON public.court_sport_modalities;
CREATE POLICY "authenticated_users_can_view_court_sport_modalities"
ON public.court_sport_modalities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.user_companies uc ON uc.company_id = ct.company_id AND uc.user_id = auth.uid()
    WHERE ct.id = court_sport_modalities.court_id
  )
  OR EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.collaborators c ON c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true
    WHERE ct.id = court_sport_modalities.court_id
  )
);

DROP POLICY IF EXISTS "authenticated_users_can_insert_court_sport_modalities" ON public.court_sport_modalities;
CREATE POLICY "authenticated_users_can_insert_court_sport_modalities"
ON public.court_sport_modalities FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.user_companies uc ON uc.company_id = ct.company_id AND uc.user_id = auth.uid()
    WHERE ct.id = court_sport_modalities.court_id
  )
  OR EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.collaborators c ON c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true
    WHERE ct.id = court_sport_modalities.court_id
  )
);

DROP POLICY IF EXISTS "authenticated_users_can_update_court_sport_modalities" ON public.court_sport_modalities;
CREATE POLICY "authenticated_users_can_update_court_sport_modalities"
ON public.court_sport_modalities FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.user_companies uc ON uc.company_id = ct.company_id AND uc.user_id = auth.uid()
    WHERE ct.id = court_sport_modalities.court_id
  )
  OR EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.collaborators c ON c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true
    WHERE ct.id = court_sport_modalities.court_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.user_companies uc ON uc.company_id = ct.company_id AND uc.user_id = auth.uid()
    WHERE ct.id = court_sport_modalities.court_id
  )
  OR EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.collaborators c ON c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true
    WHERE ct.id = court_sport_modalities.court_id
  )
);

DROP POLICY IF EXISTS "authenticated_users_can_delete_court_sport_modalities" ON public.court_sport_modalities;
CREATE POLICY "authenticated_users_can_delete_court_sport_modalities"
ON public.court_sport_modalities FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.user_companies uc ON uc.company_id = ct.company_id AND uc.user_id = auth.uid()
    WHERE ct.id = court_sport_modalities.court_id
  )
  OR EXISTS (
    SELECT 1 FROM public.courts ct
    JOIN public.collaborators c ON c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true
    WHERE ct.id = court_sport_modalities.court_id
  )
);

DROP POLICY IF EXISTS "anon_can_select_court_sport_modalities_when_public_booking_allowed" ON public.court_sport_modalities;
CREATE POLICY "anon_can_select_court_sport_modalities_when_public_booking_allowed"
ON public.court_sport_modalities FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_sport_modalities.court_id
      AND public.company_public_court_booking_allowed(ct.company_id)
  )
);

DROP TRIGGER IF EXISTS trg_require_subscriptions_court_sport_modalities ON public.court_sport_modalities;
CREATE TRIGGER trg_require_subscriptions_court_sport_modalities
BEFORE INSERT OR UPDATE OR DELETE ON public.court_sport_modalities
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_court_id();

CREATE OR REPLACE FUNCTION public.resolve_court_sport_name_for_booking(
  p_court_id uuid,
  p_court_sport_name text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_single text;
  v_trimmed text := NULLIF(trim(COALESCE(p_court_sport_name, '')), '');
BEGIN
  SELECT count(*)::int INTO v_count
  FROM public.court_sport_modalities m
  WHERE m.court_id = p_court_id AND m.is_active = true;

  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  IF v_count = 1 THEN
    SELECT m.name INTO v_single
    FROM public.court_sport_modalities m
    WHERE m.court_id = p_court_id AND m.is_active = true
    ORDER BY m.display_order, m.name
    LIMIT 1;
    RETURN v_single;
  END IF;

  IF v_trimmed IS NULL THEN
    RAISE EXCEPTION 'Selecione a modalidade de esporte para esta quadra.';
  END IF;

  SELECT m.name INTO v_single
  FROM public.court_sport_modalities m
  WHERE m.court_id = p_court_id
    AND m.is_active = true
    AND lower(trim(m.name)) = lower(v_trimmed)
  ORDER BY m.display_order, m.name
  LIMIT 1;

  IF v_single IS NULL THEN
    RAISE EXCEPTION 'Modalidade de esporte inválida para esta quadra.';
  END IF;

  RETURN v_single;
END;
$$;

COMMENT ON FUNCTION public.resolve_court_sport_name_for_booking(uuid, text) IS
  '0 modalidades: null; 1: auto; 2+: obrigatório e validado contra cadastro da quadra.';

REVOKE ALL ON FUNCTION public.resolve_court_sport_name_for_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_court_sport_name_for_booking(uuid, text) TO anon, authenticated;

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
  v_sports jsonb;
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

  SELECT COALESCE(
    (
      SELECT jsonb_agg(m.name ORDER BY m.display_order, m.name)
      FROM public.court_sport_modalities m
      WHERE m.court_id = p_court_id AND m.is_active = true
    ),
    '[]'::jsonb
  )
  INTO v_sports;

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
      'sport_modalities', COALESCE(v_sports, '[]'::jsonb),
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
    'sport_modalities', COALESCE(v_sports, '[]'::jsonb),
    'day_open', true,
    'working_start', to_char(v_wh.start_time, 'HH24:MI:SS'),
    'working_end', to_char(v_wh.end_time, 'HH24:MI:SS'),
    'occupancy', COALESCE(v_occ, '[]'::jsonb)
  );
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
  p_observations text DEFAULT NULL,
  p_court_sport_name text DEFAULT NULL
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
  v_sport_name text;
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

  v_sport_name := public.resolve_court_sport_name_for_booking(p_court_id, p_court_sport_name);

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
    court_id,
    court_sport_name
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
    p_court_id,
    v_sport_name
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

CREATE OR REPLACE FUNCTION public.create_court_booking_public(
  p_company_id uuid,
  p_court_id uuid,
  p_client_id uuid,
  p_client_nickname text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_minutes integer,
  p_observations text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_court_sport_name text DEFAULT NULL
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
  v_payment_method text := COALESCE(NULLIF(trim(COALESCE(p_payment_method, '')), ''), 'mercado_pago');
  v_allow_counter boolean := false;
  v_sport_name text;
BEGIN
  IF NOT public.company_public_court_booking_allowed(p_company_id) THEN
    RAISE EXCEPTION 'Reserva pública não disponível para esta empresa';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  IF v_payment_method NOT IN ('mercado_pago', 'dinheiro') THEN
    RAISE EXCEPTION 'Método de pagamento inválido para reserva pública.';
  END IF;

  SELECT COALESCE(co.public_court_allow_counter_payment, false)
    INTO v_allow_counter
  FROM public.companies co
  WHERE co.id = p_company_id;

  IF v_payment_method = 'dinheiro' AND NOT v_allow_counter THEN
    RAISE EXCEPTION 'Pagamento no balcão não está habilitado para esta empresa.';
  END IF;

  IF v_payment_method = 'mercado_pago' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.company_payment_credentials cpc
      WHERE cpc.company_id = p_company_id
        AND cpc.provider = 'mercadopago'
        AND cpc.is_active = true
    ) THEN
      RAISE EXCEPTION 'Pagamento online Mercado Pago não está configurado para esta empresa.';
    END IF;
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

  v_sport_name := public.resolve_court_sport_name_for_booking(p_court_id, p_court_sport_name);

  v_price := public.compute_court_booking_total_price(
    p_court_id,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes
  );

  IF v_payment_method = 'mercado_pago' AND (v_price IS NULL OR v_price < 0.50) THEN
    RAISE EXCEPTION 'Valor mínimo para reserva pública com pagamento online é R$ 0,50.';
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
    payment_method,
    observations,
    created_by_user_id,
    status,
    booking_kind,
    court_id,
    court_sport_name
  ) VALUES (
    p_company_id,
    p_client_id,
    NULLIF(trim(COALESCE(p_client_nickname, '')), ''),
    v_collaborator_id,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes,
    COALESCE(v_price, 0),
    v_payment_method,
    NULLIF(trim(COALESCE(p_observations, '')), ''),
    NULL,
    'pendente',
    'court',
    p_court_id,
    v_sport_name
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

-- Wrapper 8 parâmetros (compatibilidade MP obrigatório legado)
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
BEGIN
  RETURN public.create_court_booking_public(
    p_company_id,
    p_court_id,
    p_client_id,
    p_client_nickname,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes,
    p_observations,
    'mercado_pago',
    NULL
  );
END;
$$;

-- Wrapper 9 parâmetros sem esporte
CREATE OR REPLACE FUNCTION public.create_court_booking_public(
  p_company_id uuid,
  p_court_id uuid,
  p_client_id uuid,
  p_client_nickname text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_minutes integer,
  p_observations text DEFAULT NULL,
  p_payment_method text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_court_booking_public(
    p_company_id,
    p_court_id,
    p_client_id,
    p_client_nickname,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes,
    p_observations,
    p_payment_method,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking_public(uuid, uuid, uuid, text, date, time, integer, text, text, text) TO anon, authenticated;
