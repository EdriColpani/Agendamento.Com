-- Evita envio duplicado no WhatsApp mantendo uma unica origem de automacao.
-- Estrategia: manter somente o scheduler externo (GitHub Actions) e
-- desativar agendadores internos concorrentes.

-- 1) Desativa job pg_cron do WhatsApp (se existir)
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'whatsapp-message-scheduler-job'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
    RAISE NOTICE 'pg_cron desativado: job % (id=%).', 'whatsapp-message-scheduler-job', v_job_id;
  ELSE
    RAISE NOTICE 'pg_cron do WhatsApp ja estava ausente.';
  END IF;
END;
$$;

-- 2) Desativa fallback por trigger (insert de PENDING chamando a Edge)
DROP TRIGGER IF EXISTS trg_kick_whatsapp_scheduler_on_pending_insert
ON public.message_send_log;

DROP FUNCTION IF EXISTS public.kick_whatsapp_scheduler_on_pending_insert();

