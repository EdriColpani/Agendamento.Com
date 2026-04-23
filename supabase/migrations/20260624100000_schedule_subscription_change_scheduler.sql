-- Executa o scheduler de troca de plano para aplicar downgrades agendados.
-- Frequência: a cada 15 minutos.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'subscription-change-scheduler-job'
  ) THEN
    PERFORM cron.unschedule('subscription-change-scheduler-job');
  END IF;
END $$;

SELECT cron.schedule(
  'subscription-change-scheduler-job',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/subscription-change-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'limit', 200
      )
    ) AS request_id;
  $$
);

