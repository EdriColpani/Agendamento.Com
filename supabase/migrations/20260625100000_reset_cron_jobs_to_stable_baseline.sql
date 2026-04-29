-- Padroniza cron jobs do banco novo para o mesmo baseline operacional do banco antigo.
-- Objetivo:
-- 1) Remover jobs legados/extras que dificultam diagnostico.
-- 2) Recriar apenas os jobs estaveis (timeout, reconciliacao, whatsapp scheduler).
-- 3) Garantir uso de net.http_post (schema correto).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_job RECORD;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'court-booking-payment-timeout-job',
      'court-booking-refund-reconciliation-job',
      'whatsapp-message-scheduler-job',
      'whatsapp-message-scheduler-worker',
      'subscription-change-scheduler-job',
      'cron-heartbeat-whatsapp'
    )
  LOOP
    BEGIN
      PERFORM cron.unschedule(v_job.jobname);
    EXCEPTION WHEN OTHERS THEN
      -- ignora falhas pontuais para seguir com recriacao idempotente
      NULL;
    END;
  END LOOP;
END $$;

-- 1) Timeout de pagamento de reserva de quadra (a cada 5 minutos)
SELECT cron.schedule(
  'court-booking-payment-timeout-job',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/court-booking-payment-timeout-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'timeout_minutes', 30,
        'limit', 200
      )
    ) AS request_id;
  $$
);

-- 2) Reconciliacao de estornos/reembolsos (a cada 10 minutos)
SELECT cron.schedule(
  'court-booking-refund-reconciliation-job',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/court-booking-refund-reconciliation',
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

-- 3) Scheduler WhatsApp (a cada 1 minuto)
SELECT cron.schedule(
  'whatsapp-message-scheduler-job',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_whatsapp_cron_auth_token()
      ),
      body := jsonb_build_object('source', 'cron_worker', 'timestamp', extract(epoch from now())::text)
    ) AS request_id;
  $$
);
