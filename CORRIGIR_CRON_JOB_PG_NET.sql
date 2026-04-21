-- =====================================================
-- CORRIGIR CRON JOB: Trocar pg_net por net
-- =====================================================
-- Problema: Cron job está usando pg_net.http_post
-- Solução: Usar net.http_post (schema correto)
-- =====================================================

-- 1. REMOVER O CRON JOB ATUAL (com erro)
SELECT cron.unschedule('whatsapp-message-scheduler-job');

-- 2. CRIAR NOVO CRON JOB COM O SCHEMA CORRETO (net em vez de pg_net)
SELECT cron.schedule(
  'whatsapp-message-scheduler-job',
  '*/5 * * * *',  -- A cada 5 minutos
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- 3. VERIFICAR SE O CRON JOB FOI CRIADO CORRETAMENTE
SELECT 
  jobid,
  schedule,
  LEFT(command, 200) as command_preview,
  active,
  jobname
FROM cron.job
WHERE jobname = 'whatsapp-message-scheduler-job';

-- 4. VERIFICAR SE A EXTENSÃO pg_net ESTÁ HABILITADA (necessária para net.http_post)
SELECT 
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_net';

-- Se não estiver habilitada, execute:
-- CREATE EXTENSION IF NOT EXISTS pg_net;


