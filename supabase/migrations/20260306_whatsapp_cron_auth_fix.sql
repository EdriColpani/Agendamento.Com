-- =====================================================
-- CORREÇÃO 401: CRON PRECISA ENVIAR TOKEN VÁLIDO
-- =====================================================
-- Causa: RLS em app_config só permitia service_role/authenticated.
-- O cron roda como postgres (não via JWT), então não lia a chave → Bearer vazio → 401.
-- =====================================================

-- 1) Permitir que o cron (que roda como postgres) leia as chaves em app_config
DROP POLICY IF EXISTS "cron_can_read_auth_keys" ON public.app_config;
CREATE POLICY "cron_can_read_auth_keys"
ON public.app_config FOR SELECT
TO postgres
USING (key IN ('service_role_key', 'whatsapp_cron_secret'));

-- 2) Garantir linhas em app_config (valor vazio = ainda não configurado)
INSERT INTO public.app_config (key, value, description, updated_at)
VALUES
  ('service_role_key', '', 'Service Role Key do projeto (Settings → API).', NOW()),
  ('whatsapp_cron_secret', '', 'Secret para o cron (opcional). Mesmo valor em Edge Function Secrets → WHATSAPP_CRON_SECRET.', NOW())
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- 3) Função que retorna o token para o cron enviar no Authorization
CREATE OR REPLACE FUNCTION get_whatsapp_cron_auth_token()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  SELECT value INTO v_token FROM public.app_config WHERE key = 'service_role_key' AND value IS NOT NULL AND value != '' LIMIT 1;
  IF v_token IS NOT NULL AND v_token != '' THEN
    RETURN v_token;
  END IF;
  SELECT value INTO v_token FROM public.app_config WHERE key = 'whatsapp_cron_secret' AND value IS NOT NULL AND value != '' LIMIT 1;
  RETURN COALESCE(v_token, '');
END;
$$;

-- 4) Remover jobs antigos e recriar o cron com a função que lê app_config
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname IN ('whatsapp-message-scheduler-job', 'whatsapp-message-scheduler-worker')
  LOOP
    PERFORM cron.unschedule(job_record.jobname);
  END LOOP;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    job_name := 'whatsapp-message-scheduler-worker',
    schedule := '* * * * *',
    command := $cmd$
    SELECT net.http_post(
      url := 'https://tegyiuktrmcqxkbjxqoc.supabase.co/functions/v1/whatsapp-message-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || get_whatsapp_cron_auth_token()
      ),
      body := jsonb_build_object('source', 'cron_worker', 'timestamp', extract(epoch from now())::text)
    ) AS request_id;
    $cmd$
  );
  RAISE NOTICE 'Cron job recriado. Se app_config.service_role_key estiver preenchido, o 401 deve parar em até 1 minuto.';
END $$;

COMMENT ON FUNCTION get_whatsapp_cron_auth_token() IS
'Retorna o token para o cron enviar no header Authorization. Preencha app_config: service_role_key (Settings → API) ou whatsapp_cron_secret.';
