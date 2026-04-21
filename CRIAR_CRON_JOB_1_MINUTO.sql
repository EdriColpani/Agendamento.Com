-- =====================================================
-- CRIAR CRON JOB PARA EXECUTAR A CADA 1 MINUTO
-- =====================================================
-- Este script resolve o erro de ambiguidade do cron.schedule
-- =====================================================

-- 1. Verificar se há jobs duplicados e remover
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN 
        SELECT jobid, jobname 
        FROM cron.job 
        WHERE jobname = 'whatsapp-message-scheduler-worker'
    LOOP
        BEGIN
            PERFORM cron.unschedule(job_record.jobname);
            RAISE NOTICE 'Job removido: %', job_record.jobname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao remover job %: %', job_record.jobname, SQLERRM;
        END;
    END LOOP;
END $$;

-- 2. Verificar assinaturas disponíveis (para debug)
SELECT 
    'Assinaturas disponíveis de cron.schedule:' as info,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'cron' 
  AND p.proname = 'schedule';

-- 3. Criar cron job usando sintaxe que funciona
-- IMPORTANTE: Se der erro de ambiguidade, execute o script CORRIGIR_CRON_SCHEDULE_AMBIGUO.sql primeiro
SELECT cron.schedule(
    'whatsapp-message-scheduler-worker',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
            'source', 'cron_worker',
            'timestamp', extract(epoch from now())::text
        )
    ) AS request_id;
    $$
) AS job_id;

-- 4. Verificar se foi criado
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    CASE 
        WHEN active AND schedule = '* * * * *' THEN '✅ ATIVO - Executa a cada 1 minuto'
        WHEN active THEN '✅ ATIVO - Frequência: ' || schedule
        ELSE '❌ INATIVO'
    END as status
FROM cron.job
WHERE jobname = 'whatsapp-message-scheduler-worker';




















