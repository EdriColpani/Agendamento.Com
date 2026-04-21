-- =====================================================
-- CORRIGIR ERRO DE AMBIGUIDADE NO cron.schedule
-- =====================================================
-- Erro: function name "cron.schedule" is not unique
-- Solução: Especificar explicitamente a assinatura da função
-- =====================================================

-- 1. Verificar assinaturas disponíveis de cron.schedule
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    p.oid
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'cron' 
  AND p.proname = 'schedule'
ORDER BY p.oid;

-- 2. Remover job antigo se existir
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-message-scheduler-worker'
    ) THEN
        PERFORM cron.unschedule('whatsapp-message-scheduler-worker');
        RAISE NOTICE 'Job antigo removido';
    END IF;
END $$;

-- 3. Criar cron job usando OID específico para evitar ambiguidade
-- Usar a assinatura: (job_name text, schedule text, command text)
DO $$
DECLARE
    v_schedule_func OID;
    v_job_id BIGINT;
BEGIN
    -- Buscar OID da função cron.schedule com 3 parâmetros TEXT
    SELECT p.oid INTO v_schedule_func
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'cron' 
      AND p.proname = 'schedule'
      AND pg_get_function_arguments(p.oid) LIKE '%text%'
      AND array_length(p.proargtypes, 1) = 3
    LIMIT 1;
    
    IF v_schedule_func IS NULL THEN
        RAISE EXCEPTION 'Função cron.schedule com 3 parâmetros TEXT não encontrada';
    END IF;
    
    -- Executar usando OID específico
    EXECUTE format(
        'SELECT cron.schedule($1, $2, $3)',
        v_schedule_func
    )
    USING 
        'whatsapp-message-scheduler-worker',
        '* * * * *',
        'SELECT net.http_post(
            url := ''https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler'',
            headers := jsonb_build_object(
                ''Content-Type'', ''application/json'',
                ''Authorization'', ''Bearer '' || current_setting(''app.settings.service_role_key'', true)
            ),
            body := jsonb_build_object(
                ''source'', ''cron_worker'',
                ''timestamp'', extract(epoch from now())::text
            )
        ) AS request_id;'
    INTO v_job_id;
    
    RAISE NOTICE '✅ Cron job criado com sucesso. Job ID: %', v_job_id;
END $$;

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




















