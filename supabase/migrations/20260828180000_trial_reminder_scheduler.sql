-- ============================================================================
-- Fase 6 — E-mails automáticos do trial (lembretes dias 0, 7, 12, 15)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trial_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  days_since_start integer NOT NULL CHECK (days_since_start >= 0),
  email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trial_reminder_log_subscription_day
  ON public.trial_reminder_log (subscription_id, days_since_start);

CREATE INDEX IF NOT EXISTS idx_trial_reminder_log_company
  ON public.trial_reminder_log (company_id, sent_at DESC);

COMMENT ON TABLE public.trial_reminder_log IS
  'Deduplicação de e-mails automáticos do período de teste (dias 0, 7, 12, 15).';

ALTER TABLE public.trial_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_trial_reminder_log" ON public.trial_reminder_log;
CREATE POLICY "service_role_manage_trial_reminder_log"
  ON public.trial_reminder_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_trial_started_active
  ON public.company_subscriptions (trial_started_at)
  WHERE trial_started_at IS NOT NULL AND status IN ('trial', 'expired');

-- Cron diário 12:30 UTC (09:30 America/Sao_Paulo) — após expiração de trials (12:15 UTC).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'trial-reminder-scheduler-job'
  ) THEN
    PERFORM cron.unschedule('trial-reminder-scheduler-job');
  END IF;
END $$;

SELECT cron.schedule(
  'trial-reminder-scheduler-job',
  '30 12 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/trial-reminder-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body := jsonb_build_object('limit', 500)
    ) AS request_id;
  $$
);
