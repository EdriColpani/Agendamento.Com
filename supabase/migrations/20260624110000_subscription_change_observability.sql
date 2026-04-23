-- Observabilidade e hardening do fluxo de troca de plano.

CREATE TABLE IF NOT EXISTS public.subscription_change_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running', 'success', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  duration_ms integer NULL,
  processed_count integer NOT NULL DEFAULT 0,
  applied_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  stale_pending_marked_failed integer NOT NULL DEFAULT 0,
  details jsonb NULL,
  error_message text NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_change_scheduler_runs_started_at
  ON public.subscription_change_scheduler_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_status_created
  ON public.subscription_change_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_status_effective
  ON public.subscription_change_requests(status, effective_at ASC);

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_failed_recent
  ON public.subscription_change_requests(created_at DESC)
  WHERE status = 'failed';

ALTER TABLE public.subscription_change_scheduler_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_subscription_change_scheduler_runs"
ON public.subscription_change_scheduler_runs;
CREATE POLICY "service_role_manage_subscription_change_scheduler_runs"
ON public.subscription_change_scheduler_runs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

