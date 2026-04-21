-- =====================================================
-- CRIAR CRON JOB SIMPLES (SEM AMBIGUIDADE)
-- =====================================================
-- Este script cria o cron job usando sintaxe que evita ambiguidade
-- =====================================================

-- Remover job antigo se existir
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-message-scheduler-worker'
    ) THEN
        PERFORM cron.unschedule('whatsapp-message-scheduler-worker');
    END IF;
END $$;

-- Criar cron job usando sintaxe direta
-- Usar delimitador $cmd$ para evitar conflito com $$ do DO block
DO $$
BEGIN
    PERFORM cron.schedule(
        job_name := 'whatsapp-message-scheduler-worker',
        schedule := '* * * * *',
        command := $cmd$
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
        $cmd$
    );
    RAISE NOTICE '✅ Cron job criado: whatsapp-message-scheduler-worker';
    RAISE NOTICE '✅ Frequência: A cada 1 minuto';
END $$;

-- Verificar se foi criado
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

