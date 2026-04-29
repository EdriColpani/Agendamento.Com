-- Correção do cron automático de WhatsApp:
-- Em alguns ambientes migrados, current_setting('app.settings.service_role_key', true)
-- pode retornar vazio no contexto do pg_cron. Para blindar, usar função com fallback.

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
      'Authorization', 'Bearer ' || public.get_whatsapp_cron_auth_token()
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
