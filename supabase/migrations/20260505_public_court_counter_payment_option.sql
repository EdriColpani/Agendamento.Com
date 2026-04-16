-- Arena: permitir (opcional) pagamento no balcão no link público.
-- Default false para manter comportamento atual.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_court_allow_counter_payment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.public_court_allow_counter_payment IS
  'Quando true, o link público de quadras permite reservar com pagamento no balcão.';

CREATE OR REPLACE FUNCTION public.company_public_court_payment_options(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
  v_allow_counter boolean := false;
  v_allow_online boolean := false;
BEGIN
  v_allowed := public.company_public_court_booking_allowed(p_company_id);
  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'allow_online', false,
      'allow_counter', false,
      'message', 'Reserva pública de quadras não disponível para esta empresa.'
    );
  END IF;

  SELECT COALESCE(co.public_court_allow_counter_payment, false)
    INTO v_allow_counter
  FROM public.companies co
  WHERE co.id = p_company_id;

  v_allow_online := public.company_public_court_mercadopago_ready(p_company_id);

  RETURN jsonb_build_object(
    'ok', true,
    'allow_online', v_allow_online,
    'allow_counter', v_allow_counter
  );
END;
$$;

COMMENT ON FUNCTION public.company_public_court_payment_options(uuid) IS
  'Retorna opções de pagamento habilitadas no link público de quadras para a empresa.';

REVOKE ALL ON FUNCTION public.company_public_court_payment_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_public_court_payment_options(uuid) TO anon, authenticated;

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
DECLARE
  v_id uuid;
  v_ns int;
  v_ne int;
  v_collaborator_id uuid;
  v_service_id uuid;
  v_price numeric(12, 2);
  v_payment_method text := COALESCE(NULLIF(trim(COALESCE(p_payment_method, '')), ''), 'mercado_pago');
  v_allow_counter boolean := false;
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
    court_id
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
