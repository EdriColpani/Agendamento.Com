-- =====================================================
-- DIAGNOSTICAR PROBLEMA COM EDGE FUNCTION
-- =====================================================

-- 1. Verificar mensagem pendente
SELECT 
    '=== MENSAGEM PENDENTE ===' as secao,
    msl.id,
    msl.appointment_id,
    cl.name as cliente,
    cl.phone as telefone,
    msl.scheduled_for AT TIME ZONE 'America/Sao_Paulo' as scheduled_for_brasilia,
    NOW() AT TIME ZONE 'America/Sao_Paulo' as agora_brasilia,
    msl.status,
    CASE 
        WHEN msl.scheduled_for::timestamp <= NOW() THEN '⚠️ DEVERIA TER SIDO ENVIADA'
        ELSE '⏳ AINDA NÃO É HORA'
    END as status_envio
FROM message_send_log msl
LEFT JOIN clients cl ON cl.id = msl.client_id
WHERE msl.status = 'PENDING'
ORDER BY msl.scheduled_for
LIMIT 5;

-- 2. Verificar se a service_role_key está funcionando
SELECT 
    '=== AUTENTICAÇÃO ===' as secao,
    CASE 
        WHEN get_service_role_key() != '' 
        THEN '✅ Chave configurada (' || length(get_service_role_key()) || ' caracteres)'
        ELSE '❌ Chave NÃO configurada'
    END as status_auth,
    LEFT(get_service_role_key(), 20) || '...' as preview_chave
FROM (SELECT 1) as dummy;

-- 3. Testar chamada da Edge Function com detalhes
SELECT 
    '=== TESTE EDGE FUNCTION ===' as secao,
    net.http_post(
        url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || get_service_role_key()
        ),
        body := jsonb_build_object(
            'source', 'diagnostic_test',
            'timestamp', extract(epoch from now())::text,
            'debug', true
        )
    ) AS request_id;

-- 4. Verificar logs do worker (se houver)
SELECT 
    '=== LOGS DO WORKER (ÚLTIMAS 3) ===' as secao,
    execution_time AT TIME ZONE 'America/Sao_Paulo' as execution_time_brasilia,
    status,
    messages_processed,
    messages_sent,
    messages_failed,
    error_message,
    details
FROM worker_execution_logs
ORDER BY execution_time DESC
LIMIT 3;

-- 5. Verificar histórico de execuções do cron
SELECT 
    '=== EXECUÇÕES DO CRON (ÚLTIMAS 3) ===' as secao,
    start_time AT TIME ZONE 'America/Sao_Paulo' as start_time_brasilia,
    status,
    return_message,
    CASE 
        WHEN status = 'succeeded' THEN '✅ SUCESSO'
        WHEN status = 'failed' THEN '❌ FALHOU'
        ELSE '⚠️ ' || status
    END as resultado
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'whatsapp-message-scheduler-worker')
ORDER BY start_time DESC
LIMIT 3;


















