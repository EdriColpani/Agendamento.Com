-- =====================================================
-- CONFIGURAR CRON JOB PARA WHATSAPP MESSAGE SCHEDULER
-- =====================================================
-- Este script configura a execução automática da função
-- whatsapp-message-scheduler a cada 5 minutos
-- =====================================================

-- Verificar se a extensão pg_cron está habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remover job anterior se existir (para evitar duplicatas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-message-scheduler-job'
  ) THEN
    PERFORM cron.unschedule('whatsapp-message-scheduler-job');
  END IF;
END $$;

-- Criar o cron job para executar a função a cada 5 minutos
-- A função será chamada via HTTP POST na URL da Edge Function
SELECT cron.schedule(
  'whatsapp-message-scheduler-job',           -- Nome do job
  '*/5 * * * *',                              -- A cada 5 minutos (cron expression)
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

-- =====================================================
-- NOTA: Se a extensão pg_cron não estiver disponível,
-- você precisará configurar o cron job manualmente via:
-- 1. Supabase Dashboard → Edge Functions → Cron Jobs
-- 2. Ou usar um serviço externo (ex: cron-job.org)
-- =====================================================

