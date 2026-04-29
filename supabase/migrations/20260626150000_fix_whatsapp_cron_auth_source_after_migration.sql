-- Correção estrutural pós-migração:
-- 1) Prioriza app.settings.service_role_key (fonte oficial do projeto) para evitar
--    token antigo em app_config herdado de backup.
-- 2) Recria o cron do WhatsApp usando current_setting(...) direto.

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
  -- 1) Fonte oficial do projeto (mais confiável em ambiente migrado)
  v_token := nullif(current_setting('app.settings.service_role_key', true), '');
  IF v_token IS NOT NULL AND btrim(v_token) <> '' THEN
    RETURN v_token;
  END IF;

  -- 2) Fallback para app_config.service_role_key
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

  -- 3) Fallback para segredo dedicado de cron
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

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('whatsapp-message-scheduler-job');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

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

COMMENT ON FUNCTION public.get_whatsapp_cron_auth_token() IS
'Retorna token do cron priorizando app.settings.service_role_key (projeto atual), com fallback para app_config.';
