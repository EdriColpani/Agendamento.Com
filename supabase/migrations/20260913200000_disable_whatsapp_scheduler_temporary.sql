-- Desativação TEMPORÁRIA e reversível do scheduler automático de WhatsApp.
-- Motivo: nenhum cliente usando o plano WhatsApp; o job a cada 1 minuto
-- satura CPU/Disk I/O. Código, tabelas, RPCs e Edge Function permanecem intactos.
--
-- NÃO usa cron.unschedule / DELETE. Apenas active = false.
-- NÃO altera outros jobs.
--
-- Reativar: ver docs/WHATSAPP_SCHEDULER_REATIVACAO.md
--   UPDATE cron.job SET active = true
--   WHERE jobname = 'whatsapp-message-scheduler-job';
--   ALTER TABLE public.message_send_log
--     ENABLE TRIGGER trg_kick_whatsapp_scheduler_on_pending_insert;

-- A role de migration não tem UPDATE direto em cron.job; alter_job é a API oficial
-- e NÃO remove o job (apenas active = false).
SELECT cron.alter_job(j.jobid, active := false)
FROM cron.job j
WHERE j.jobname = 'whatsapp-message-scheduler-job';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'message_send_log'
      AND t.tgname = 'trg_kick_whatsapp_scheduler_on_pending_insert'
  ) THEN
    EXECUTE 'ALTER TABLE public.message_send_log DISABLE TRIGGER trg_kick_whatsapp_scheduler_on_pending_insert';
  END IF;
END $$;
