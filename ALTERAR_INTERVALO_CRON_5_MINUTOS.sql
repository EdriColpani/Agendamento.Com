-- =====================================================
-- ALTERAR INTERVALO DO CRON JOB PARA 5 MINUTOS
-- =====================================================
-- Este script altera o intervalo de execução do worker
-- de mensagens WhatsApp de 1 minuto para 5 minutos
-- para reduzir a quantidade de logs gerados
-- =====================================================

-- IMPORTANTE: O mínimo permitido pelo pg_cron é 1 minuto
-- 5 minutos é um bom equilíbrio entre:
-- - Rapidez no processamento (mensagens enviadas em até 5 minutos)
-- - Redução de logs (80% menos execuções)
-- - Menor uso de recursos

-- 1. Remover job atual se existir
DO $$
BEGIN
    -- Remover job antigo (qualquer um que exista)
    IF EXISTS (
        SELECT 1 FROM cron.job 
        WHERE jobname = 'whatsapp-message-scheduler-worker'
    ) THEN
        PERFORM cron.unschedule('whatsapp-message-scheduler-worker');
        RAISE NOTICE '✅ Job antigo removido: whatsapp-message-scheduler-worker';
    END IF;
    
    -- Remover também jobs com nomes antigos
    IF EXISTS (
        SELECT 1 FROM cron.job 
        WHERE jobname = 'whatsapp-message-scheduler-job'
    ) THEN
        PERFORM cron.unschedule('whatsapp-message-scheduler-job');
        RAISE NOTICE '✅ Job antigo removido: whatsapp-message-scheduler-job';
    END IF;
END $$;

-- 2. Criar novo job com intervalo de 5 minutos
DO $$
BEGIN
    PERFORM cron.schedule(
        job_name := 'whatsapp-message-scheduler-worker',
        schedule := '*/5 * * * *',
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
    RAISE NOTICE 'Cron job criado: whatsapp-message-scheduler-worker';
    RAISE NOTICE 'Frequencia: A cada 5 minutos';
    RAISE NOTICE 'Reducao de logs: 80% menos execucoes (de 1 min para 5 min)';
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
        WHEN schedule = '*/5 * * * *' THEN '✅ Executa a cada 5 minutos'
        WHEN schedule = '* * * * *' THEN '⚠️ Executa a cada 1 minuto (muito frequente)'
        WHEN schedule = '*/2 * * * *' THEN '⚠️ Executa a cada 2 minutos'
        ELSE '❓ Frequência: ' || schedule
    END as frequencia_descricao,
    'Mensagens serão processadas em até 5 minutos após o horário agendado' as observacao
FROM cron.job
WHERE jobname = 'whatsapp-message-scheduler-worker';

-- =====================================================
-- COMPARAÇÃO DE INTERVALOS
-- =====================================================
-- 1 minuto:  1.440 execuções/dia  (muitos logs)
-- 2 minutos:   720 execuções/dia  (muitos logs)
-- 5 minutos:   288 execuções/dia  (ideal - 80% menos logs)
-- 10 minutos:  144 execuções/dia  (pode ser lento demais)
-- =====================================================

