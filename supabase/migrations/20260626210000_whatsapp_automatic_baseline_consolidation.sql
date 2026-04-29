-- Baseline definitivo de automacao WhatsApp (pos-migracao)
-- Objetivo:
-- 1) Eliminar deriva de jobs legados/conflitantes.
-- 2) Manter uma unica fonte de token para cron (projeto atual).
-- 3) Recriar somente o job oficial de envio automatico.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Funcao canonica de token:
-- prioriza app.settings.service_role_key (fonte do projeto atual),
-- com fallback para app_config em casos legados.
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
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  IF v_token IS NOT NULL AND btrim(v_token) <> '' THEN
    RETURN v_token;
  END IF;

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

  SELECT value
    INTO v_token
    FROM public.app_config
   WHERE key = 'whatsapp_cron_secret'
     AND value IS NOT NULL
     AND btrim(value) <> ''
   LIMIT 1;

  RETURN COALESCE(v_token, '');
END;
$$;

COMMENT ON FUNCTION public.get_whatsapp_cron_auth_token() IS
'Token do cron WhatsApp: prioriza app.settings.service_role_key do projeto atual; fallback para app_config.';

-- Limpa jobs antigos/duplicados relacionados a WhatsApp para evitar concorrencia e drift.
DO $$
DECLARE
  v_job RECORD;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE
      jobname ILIKE '%whatsapp%' OR
      command ILIKE '%whatsapp-message-scheduler%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(v_job.jobname);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Recria APENAS o job oficial do scheduler WhatsApp (1 minuto).
SELECT cron.schedule(
  'whatsapp-message-scheduler-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) AS request_id;
  $$
);
