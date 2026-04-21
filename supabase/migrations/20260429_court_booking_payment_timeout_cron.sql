-- Cancelamento automático de reservas públicas de quadra sem pagamento aprovado.
-- Executa Edge Function periodicamente (a cada 5 min) para cancelar reservas
-- `pendente` / `mercado_pago` expiradas.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'court-booking-payment-timeout-job'
  ) THEN
    PERFORM cron.unschedule('court-booking-payment-timeout-job');
  END IF;
END $$;

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
