-- ============================================================================
-- Fase 4 — Expiração automática de trials (pg_cron + RPC + logs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trial_expiration_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running', 'success', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  duration_ms integer NULL,
  processed_count integer NOT NULL DEFAULT 0,
  expired_count integer NOT NULL DEFAULT 0,
  details jsonb NULL,
  error_message text NULL
);

CREATE INDEX IF NOT EXISTS idx_trial_expiration_scheduler_runs_started_at
  ON public.trial_expiration_scheduler_runs (started_at DESC);

COMMENT ON TABLE public.trial_expiration_scheduler_runs IS
  'Execuções do job de expiração de assinaturas em trial.';

CREATE TABLE IF NOT EXISTS public.trial_expiration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  company_id uuid NOT NULL,
  plan_id uuid NULL,
  trial_ends_at timestamptz NOT NULL,
  expired_at timestamptz NOT NULL DEFAULT now(),
  scheduler_run_id uuid NULL REFERENCES public.trial_expiration_scheduler_runs(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trial_expiration_log_subscription
  ON public.trial_expiration_log (subscription_id);

CREATE INDEX IF NOT EXISTS idx_trial_expiration_log_company
  ON public.trial_expiration_log (company_id, expired_at DESC);

COMMENT ON TABLE public.trial_expiration_log IS
  'Auditoria de trials expirados (uma linha por assinatura trial expirada).';

ALTER TABLE public.trial_expiration_scheduler_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_expiration_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_trial_expiration_scheduler_runs"
  ON public.trial_expiration_scheduler_runs;
CREATE POLICY "service_role_manage_trial_expiration_scheduler_runs"
  ON public.trial_expiration_scheduler_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_manage_trial_expiration_log"
  ON public.trial_expiration_log;
CREATE POLICY "service_role_manage_trial_expiration_log"
  ON public.trial_expiration_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- RPC idempotente: só altera trials vencidos ainda com status=trial.
CREATE OR REPLACE FUNCTION public.expire_due_trial_subscriptions(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT cs.id
    FROM public.company_subscriptions cs
    WHERE cs.status = 'trial'
      AND cs.is_trial = true
      AND cs.trial_ends_at IS NOT NULL
      AND cs.trial_ends_at <= NOW()
    ORDER BY cs.trial_ends_at ASC
    LIMIT greatest(1, least(coalesce(p_limit, 200), 500))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.company_subscriptions cs
    SET
      status = 'expired',
      is_trial = false
    FROM due
    WHERE cs.id = due.id
    RETURNING cs.id AS subscription_id, cs.company_id, cs.plan_id, cs.trial_ends_at
  )
  SELECT jsonb_build_object(
    'success', true,
    'expired_count', (SELECT count(*)::int FROM updated),
    'expired', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'subscription_id', u.subscription_id,
            'company_id', u.company_id,
            'plan_id', u.plan_id,
            'trial_ends_at', u.trial_ends_at
          )
        )
        FROM updated u
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.expire_due_trial_subscriptions(integer) IS
  'Marca trials vencidos como status=expired e is_trial=false. Idempotente.';

GRANT EXECUTE ON FUNCTION public.expire_due_trial_subscriptions(integer) TO service_role;

-- Cron diário 12:15 UTC (09:15 America/Sao_Paulo) — mesma fonte pg_cron dos demais jobs de assinatura.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'trial-expiration-scheduler-job'
  ) THEN
    PERFORM cron.unschedule('trial-expiration-scheduler-job');
  END IF;
END $$;

SELECT cron.schedule(
  'trial-expiration-scheduler-job',
  '15 12 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/trial-expiration-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body := jsonb_build_object('limit', 500)
    ) AS request_id;
  $$
);
