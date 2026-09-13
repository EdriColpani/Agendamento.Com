-- Reduz frequência dos crons de quadra (não remove os jobs).
-- timeout: */5 → */25 (a cada 25 min)
-- refund:  */10 → */40 (a cada 40 min)
--
-- Em produção a alteração foi aplicada com:
--   SELECT cron.alter_job(35, schedule := '*/25 * * * *');
--   SELECT cron.alter_job(36, schedule := '*/40 * * * *');

DO $$
DECLARE
  v_timeout_id bigint;
  v_refund_id bigint;
BEGIN
  SELECT jobid INTO v_timeout_id
  FROM cron.job
  WHERE jobname = 'court-booking-payment-timeout-job'
  LIMIT 1;

  SELECT jobid INTO v_refund_id
  FROM cron.job
  WHERE jobname = 'court-booking-refund-reconciliation-job'
  LIMIT 1;

  IF v_timeout_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_timeout_id, schedule := '*/25 * * * *');
  END IF;

  IF v_refund_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_refund_id, schedule := '*/40 * * * *');
  END IF;
END $$;
