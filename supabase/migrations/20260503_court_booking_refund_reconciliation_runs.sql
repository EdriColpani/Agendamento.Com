-- Observabilidade operacional para reconciliação automática de estornos da arena.

CREATE TABLE IF NOT EXISTS public.court_booking_refund_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  scan_limit integer NOT NULL,
  retries_limit integer NOT NULL,
  scanned_count integer NOT NULL DEFAULT 0,
  refund_success_count integer NOT NULL DEFAULT 0,
  manual_required_count integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  reconciled_appointment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  warning_message text NULL,
  error_message text NULL,
  triggered_by text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.court_booking_refund_reconciliation_runs IS
  'Log operacional das execuções de reconciliação/retry de estorno de reservas de quadra.';

CREATE INDEX IF NOT EXISTS idx_court_refund_reconciliation_runs_created_at
  ON public.court_booking_refund_reconciliation_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_court_refund_reconciliation_runs_status_created_at
  ON public.court_booking_refund_reconciliation_runs(status, created_at DESC);

ALTER TABLE public.court_booking_refund_reconciliation_runs ENABLE ROW LEVEL SECURITY;
