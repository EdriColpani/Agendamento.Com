-- Blindagem do cron do WhatsApp:
-- 1) token com fallback robusto (app_config -> app.settings -> vazio)
-- 2) recriacao idempotente do job oficial
-- 3) intervalo a cada 1 minuto

CREATE OR REPLACE FUNCTION public.get_whatsapp_cron_auth_token()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- 1) Prioriza configuracao explicita em app_config (service_role_key).
  SELECT value
    INTO v_token
    FROM public.app_config
   WHERE key = 'service_role_key'
     AND value IS NOT NULL
     AND btrim(value) <> ''
   LIMIT 1;

  IF v_token IS NOT NULL AND btrim(v_token) <> '' THEN
    RETURN v_token;
  END IF;

  -- 2) Fallback para segredo dedicado de cron.
  SELECT value
    INTO v_token
    FROM public.app_config
   WHERE key = 'whatsapp_cron_secret'
     AND value IS NOT NULL
     AND btrim(value) <> ''
   LIMIT 1;

  IF v_token IS NOT NULL AND btrim(v_token) <> '' THEN
    RETURN v_token;
  END IF;

  -- 3) Fallback para app.settings.service_role_key (quando definido no projeto).
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  IF v_token IS NOT NULL AND btrim(v_token) <> '' THEN
    RETURN v_token;
  END IF;

  RETURN '';
END;
$$;

DO $$
DECLARE
  job_record RECORD;
BEGIN
  -- Remove nomes antigos para evitar duplicidade/conflito.
  FOR job_record IN
    SELECT jobname
      FROM cron.job
     WHERE jobname IN ('whatsapp-message-scheduler-job', 'whatsapp-message-scheduler-worker')
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_record.jobname);
    EXCEPTION WHEN OTHERS THEN
      -- ignore
    END;
  END LOOP;
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
    body := '{}'::jsonb
  );
  $$
);

COMMENT ON FUNCTION public.get_whatsapp_cron_auth_token() IS
'Retorna token do cron com fallback: app_config.service_role_key -> app_config.whatsapp_cron_secret -> app.settings.service_role_key.';
