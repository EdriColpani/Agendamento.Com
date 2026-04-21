-- =====================================================
-- ALTERAR INTERVALO DO CRON JOB PARA 2 MINUTOS
-- =====================================================
-- Este script altera o intervalo de execução do worker
-- de mensagens WhatsApp para 2 minutos
-- (alternativa mais rápida que 5 minutos)
-- =====================================================

-- 1. Remover job atual se existir
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job 
        WHERE jobname = 'whatsapp-message-scheduler-worker'
    ) THEN
        PERFORM cron.unschedule('whatsapp-message-scheduler-worker');
        RAISE NOTICE '✅ Job antigo removido: whatsapp-message-scheduler-worker';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM cron.job 
        WHERE jobname = 'whatsapp-message-scheduler-job'
    ) THEN
        PERFORM cron.unschedule('whatsapp-message-scheduler-job');
        RAISE NOTICE '✅ Job antigo removido: whatsapp-message-scheduler-job';
    END IF;
END $$;

-- 2. Criar novo job com intervalo de 2 minutos
DO $$
BEGIN
    PERFORM cron.schedule(
        job_name := 'whatsapp-message-scheduler-worker',
        schedule := '*/2 * * * *',  -- A cada 2 minutos
        command := $cmd$
        SELECT net.http_post(
            url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || get_service_role_key()
            ),
            body := jsonb_build_object(
                'source', 'cron_worker',
                'timestamp', extract(epoch from now())::text
            )
        ) AS request_id;
        $cmd$
    );
    RAISE NOTICE '✅ Cron job criado: whatsapp-message-scheduler-worker';
    RAISE NOTICE '✅ Frequência: A cada 2 minutos';
    RAISE NOTICE '✅ Redução de logs: 50% menos execuções (de 1 min para 2 min)';
END $$;

-- 3. Verificar se o job foi criado corretamente
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    CASE 
        WHEN active THEN '✅ ATIVO'
        ELSE '❌ INATIVO'
    END as status,
    CASE 
        WHEN schedule = '*/2 * * * *' THEN '✅ Executa a cada 2 minutos'
        ELSE '❓ Frequência: ' || schedule
    END as frequencia_descricao
FROM cron.job
WHERE jobname = 'whatsapp-message-scheduler-worker';

















