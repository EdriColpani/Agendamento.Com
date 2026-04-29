-- Estabilidade operacional do WhatsApp:
-- 1) Garante apenas 1 job cron de scheduler ativo (baseline canonical).
-- 2) Remove fallback trigger para evitar disparos concorrentes.
-- 3) Desbloqueia pendencias antigas que possam ter ficado "claimadas".

DO $$
DECLARE
  v_job record;
  v_token text;
BEGIN
  -- Remover qualquer job antigo/duplicado que dispare o scheduler.
  FOR v_job IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname ILIKE '%whatsapp-message-scheduler%'
       OR command ILIKE '%whatsapp-message-scheduler%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  v_token := public.get_whatsapp_cron_auth_token();
  IF v_token IS NULL OR btrim(v_token) = '' THEN
    RAISE EXCEPTION 'Token ausente em public.get_whatsapp_cron_auth_token().';
  END IF;

  -- Canonico: 1 execucao por minuto via pg_cron + pg_net.
  PERFORM cron.schedule(
    'whatsapp-message-scheduler-job',
    '* * * * *',
    format(
      $sql$
        select
          net.http_post(
            url := %L,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer %s'
            ),
            body := jsonb_build_object(
              'source', 'pg_cron_canonical',
              'run_at', now(),
              'timezone', 'America/Sao_Paulo'
            ),
            timeout_milliseconds := 30000
          ) as request_id;
      $sql$,
      'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
      v_token
    )
  );
END;
$$;

-- Evita gatilho concorrente no insert de PENDING.
DROP TRIGGER IF EXISTS trg_kick_whatsapp_scheduler_on_pending_insert
ON public.message_send_log;

DROP FUNCTION IF EXISTS public.kick_whatsapp_scheduler_on_pending_insert();

-- Desbloqueia mensagens pendentes que ficaram com payload de "claim".
UPDATE public.message_send_log
SET provider_response = NULL
WHERE channel = 'WHATSAPP'
  AND status = 'PENDING'
  AND provider_response ? 'claim_execution_id';

