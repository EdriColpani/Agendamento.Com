-- Ajuste operacional de confiabilidade do cron WhatsApp.
-- Mantém a mesma arquitetura e regra de negócio, mas melhora tolerância de rede/latência
-- e rastreabilidade das execuções automáticas.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('whatsapp-message-scheduler-job');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

SELECT cron.schedule(
  'whatsapp-message-scheduler-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'source', 'cron_worker',
      'run_at', now(),
      'timezone', 'America/Sao_Paulo'
    ),
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
