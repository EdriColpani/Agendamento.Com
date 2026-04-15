-- Estrutura de cancelamento de reserva de quadra para relatórios confiáveis.
-- Evita depender de parsing em observations.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancellation_reason text NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.appointments.cancellation_reason IS
  'Motivo estruturado do cancelamento da reserva.';
COMMENT ON COLUMN public.appointments.cancelled_at IS
  'Timestamp em que a reserva foi efetivamente cancelada.';
COMMENT ON COLUMN public.appointments.cancelled_by_user_id IS
  'Usuário responsável pelo cancelamento (quando aplicável).';

CREATE INDEX IF NOT EXISTS idx_appointments_court_cancelled_at
  ON public.appointments(company_id, booking_kind, status, cancelled_at DESC);
