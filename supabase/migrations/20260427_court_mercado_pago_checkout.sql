-- Checkout Mercado Pago por empresa na reserva pública de quadra.
-- 1) payment_method mercado_pago em appointments
-- 2) colunas de rastreio MP
-- 3) índice para webhook resolver pagamento com token do vendedor
-- 4) RPC create_court_booking_public aceita mercado_pago

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS mp_preference_id text NULL,
  ADD COLUMN IF NOT EXISTS mp_payment_id text NULL,
  ADD COLUMN IF NOT EXISTS mp_payment_status text NULL;

COMMENT ON COLUMN public.appointments.mp_preference_id IS 'ID da preferência Checkout Pro criada com o access token da empresa (arena).';
COMMENT ON COLUMN public.appointments.mp_payment_id IS 'ID do pagamento no Mercado Pago após confirmação.';
COMMENT ON COLUMN public.appointments.mp_payment_status IS 'Status bruto do MP: pending, approved, rejected, etc.';

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_payment_method_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_method_check CHECK (
    payment_method IS NULL
    OR payment_method IN (
      'dinheiro',
      'cartao_credito',
      'cartao_debito',
      'pix',
      'mercado_pago'
    )
  );

CREATE INDEX IF NOT EXISTS idx_appointments_court_mp_pending_scan
  ON public.appointments (created_at DESC)
  WHERE booking_kind = 'court'
    AND payment_method = 'mercado_pago'
    AND status = 'pendente'
    AND mp_payment_id IS NULL;

-- =============================================================================
-- create_court_booking_public: inclui mercado_pago
-- =============================================================================

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
    NULL
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

  IF v_payment_method IS NOT NULL
     AND v_payment_method NOT IN (
       'dinheiro',
       'cartao_credito',
       'cartao_debito',
       'pix',
       'mercado_pago'
     ) THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
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
