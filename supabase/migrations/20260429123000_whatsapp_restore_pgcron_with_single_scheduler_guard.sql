-- Reativa pg_cron do WhatsApp para restaurar processamento automatico imediato.
-- Mantemos somente este agendador interno (sem trigger fallback).
-- O worker foi blindado com "claim atomico" para evitar envio duplicado em concorrencia.

DO $$
DECLARE
  v_token text;
  v_job_id bigint;
BEGIN
  v_token := public.get_whatsapp_cron_auth_token();

  IF v_token IS NULL OR btrim(v_token) = '' THEN
    RAISE EXCEPTION 'Token ausente em public.get_whatsapp_cron_auth_token().';
  END IF;

  -- Remove job antigo, se existir, para evitar duplicidade de agendamentos.
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'whatsapp-message-scheduler-job'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

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
              'source', 'pg_cron_restore',
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

