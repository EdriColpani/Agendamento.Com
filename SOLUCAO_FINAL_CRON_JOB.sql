-- =====================================================
-- SOLUÇÃO FINAL: Corrigir Cron Job
-- =====================================================
-- Execute este SQL COMPLETO de uma vez
-- =====================================================

-- 1. Habilitar extensão pg_net (se não estiver)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remover cron job antigo
SELECT cron.unschedule('whatsapp-message-scheduler-job');

-- 3. Criar cron job CORRETO (usando net.http_post, não pg_net.http_post)
SELECT cron.schedule(
  'whatsapp-message-scheduler-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Processar logs atrasados AGORA (chamada manual)
SELECT net.http_post(
  url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
  ),
  body := '{}'::jsonb
);

-- 5. Verificar se funcionou (execute 10 segundos depois)
SELECT 
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN scheduled_for <= NOW() THEN 1 END) as atrasados
FROM message_send_log
GROUP BY status;


