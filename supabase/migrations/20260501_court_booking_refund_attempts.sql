-- Auditoria de estornos de reservas de quadra (Mercado Pago)
-- Fase A: base para rastreabilidade, idempotência e suporte operacional.

CREATE TABLE IF NOT EXISTS public.court_booking_refund_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  mp_payment_id text NOT NULL,
  payment_type_id text NULL,
  payment_method_id text NULL,
  request_idempotency_key text NULL,
  status text NOT NULL CHECK (status IN ('pending', 'success', 'error', 'manual_required')),
  mp_refund_id text NULL,
  mp_refund_status text NULL,
  error_message text NULL,
  requested_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_court_refund_attempts_company_attempted_at
  ON public.court_booking_refund_attempts(company_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_court_refund_attempts_appointment
  ON public.court_booking_refund_attempts(appointment_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_court_refund_attempts_status
  ON public.court_booking_refund_attempts(status, attempted_at DESC);

ALTER TABLE public.court_booking_refund_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.court_booking_refund_attempts IS
  'Log de tentativas de estorno de pagamentos de reservas de quadra via Mercado Pago.';
