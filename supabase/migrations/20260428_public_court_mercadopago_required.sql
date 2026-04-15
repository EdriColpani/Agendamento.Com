-- Reserva pública de quadra: obrigatório Mercado Pago (pagamento online).
-- Wrapper 8 parâmetros passa mercado_pago para manter compatibilidade de assinatura da função.

CREATE OR REPLACE FUNCTION public.company_public_court_mercadopago_ready(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_payment_credentials cpc
    WHERE cpc.company_id = p_company_id
      AND cpc.provider = 'mercadopago'
      AND cpc.is_active = true
  )
  AND public.company_public_court_booking_allowed(p_company_id);
$$;

COMMENT ON FUNCTION public.company_public_court_mercadopago_ready(uuid) IS
  'Indica se a empresa pode receber reservas pelo link público com checkout MP (credencial ativa + feature de reserva pública).';

REVOKE ALL ON FUNCTION public.company_public_court_mercadopago_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_public_court_mercadopago_ready(uuid) TO anon, authenticated;

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
    'mercado_pago'
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
  v_payment_method text := NULLIF(trim(COALESCE(p_payment_method, '')), '');
BEGIN
  IF NOT public.company_public_court_booking_allowed(p_company_id) THEN
    RAISE EXCEPTION 'Reserva pública não disponível para esta empresa';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  IF v_payment_method IS NULL OR v_payment_method <> 'mercado_pago' THEN
    RAISE EXCEPTION 'Reserva pública exige pagamento online no Mercado Pago.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_payment_credentials cpc
    WHERE cpc.company_id = p_company_id
      AND cpc.provider = 'mercadopago'
      AND cpc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Pagamento online Mercado Pago não está configurado para esta empresa.';
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

  IF v_price IS NULL OR v_price < 0.50 THEN
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
    v_price,
    'mercado_pago',
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
