-- Monitoramento simples de execução do scheduler de timeout de pagamento da arena.
-- Não interfere no fluxo principal: tabela apenas de observabilidade operacional.

CREATE TABLE IF NOT EXISTS public.court_booking_payment_timeout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  timeout_minutes integer NOT NULL,
  scan_limit integer NOT NULL,
  found_count integer NOT NULL DEFAULT 0,
  cancelled_count integer NOT NULL DEFAULT 0,
  cancelled_ids_sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text NULL,
  triggered_by text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.court_booking_payment_timeout_runs IS
  'Log operacional de execuções da Edge court-booking-payment-timeout-scheduler.';

CREATE INDEX IF NOT EXISTS idx_court_booking_timeout_runs_created_at
  ON public.court_booking_payment_timeout_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_court_booking_timeout_runs_status_created_at
  ON public.court_booking_payment_timeout_runs (status, created_at DESC);

ALTER TABLE public.court_booking_payment_timeout_runs ENABLE ROW LEVEL SECURITY;
-- Sem políticas para JWT (anon/authenticated) por padrão: acesso somente via service role.
