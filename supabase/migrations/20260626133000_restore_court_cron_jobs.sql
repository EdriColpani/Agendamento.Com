-- Restaura os cron jobs de quadra (timeout e reconciliacao) sem alterar o cron do WhatsApp.
-- Idempotente: remove e recria somente os jobs alvo.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('court-booking-payment-timeout-job');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('court-booking-refund-reconciliation-job');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
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
      ),
      timeout_milliseconds := 15000
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
      ),
      timeout_milliseconds := 15000
    ) AS request_id;
  $$
);
