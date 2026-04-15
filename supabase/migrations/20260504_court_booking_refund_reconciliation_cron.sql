-- Agendamento de reconciliação de estornos da arena.
-- Fase C/E: retry seguro e monitoramento contínuo.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'court-booking-refund-reconciliation-job'
  ) THEN
    PERFORM cron.unschedule('court-booking-refund-reconciliation-job');
  END IF;
END $$;

SELECT cron.schedule(
  'court-booking-refund-reconciliation-job',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://tegyiuktrmcqxkbjxqoc.supabase.co/functions/v1/court-booking-refund-reconciliation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'limit', 120,
        'max_retries', 3
      )
    ) AS request_id;
  $$
);
