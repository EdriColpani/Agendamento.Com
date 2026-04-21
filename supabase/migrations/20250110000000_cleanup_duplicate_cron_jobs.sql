-- =====================================================
-- LIMPAR JOBS DUPLICADOS DO CRON
-- =====================================================
-- Este script remove jobs duplicados e mantém apenas um ativo
-- =====================================================

-- Ver todos os jobs relacionados ao whatsapp-message-scheduler
SELECT jobid, jobname, schedule, active, command 
FROM cron.job 
WHERE jobname LIKE '%whatsapp%' OR command LIKE '%whatsapp-message-scheduler%';

-- Remover TODOS os jobs relacionados (vamos recriar apenas um)
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN 
    SELECT jobid, jobname 
    FROM cron.job 
    WHERE jobname LIKE '%whatsapp%' OR command LIKE '%whatsapp-message-scheduler%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_record.jobname);
      RAISE NOTICE 'Job removido: %', job_record.jobname;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Erro ao remover job %: %', job_record.jobname, SQLERRM;
    END;
  END LOOP;
END $$;

-- Criar APENAS UM job usando pg_net (mais confiável)
SELECT cron.schedule(
  'whatsapp-message-scheduler-job',
  '*/5 * * * *',
  $$
  SELECT
    pg_net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
) AS job_id;

-- Verificar o job criado
SELECT jobid, jobname, schedule, active, command 
FROM cron.job 
WHERE jobname = 'whatsapp-message-scheduler-job';

