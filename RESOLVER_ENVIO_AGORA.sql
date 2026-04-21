-- =====================================================
-- RESOLVER ENVIO DE MENSAGENS AGORA
-- =====================================================
-- Este script:
-- 1. Verifica o cron job
-- 2. Executa a Edge Function manualmente
-- 3. Verifica os resultados
-- =====================================================

-- PASSO 1: Verificar se o cron job está configurado
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    CASE 
        WHEN active = TRUE THEN '✅ CRON JOB ATIVO'
        ELSE '❌ CRON JOB INATIVO'
    END as status_cron,
    SUBSTRING(command, 1, 100) as comando_preview
FROM cron.job
WHERE jobname LIKE '%whatsapp%' 
   OR command LIKE '%whatsapp-message-scheduler%';

-- PASSO 2: Verificar mensagens PENDING que já deveriam ter sido enviadas
SELECT 
    COUNT(*) as total_pending_atrasadas,
    STRING_AGG(msl.id::TEXT, ', ') as ids_logs_atrasados
FROM message_send_log msl
WHERE msl.status = 'PENDING'
  AND msl.scheduled_for <= NOW();

-- PASSO 3: EXECUTAR A EDGE FUNCTION MANUALMENTE
-- Isso vai processar todas as mensagens PENDING e enviá-las
SELECT net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
) AS request_id;

-- IMPORTANTE: Anote o request_id retornado acima!
-- Aguarde 10-15 segundos após executar o passo 3 antes de executar o passo 4

-- PASSO 4: Verificar o resultado da requisição (substitua '1' pelo request_id do passo 3)
-- SELECT * FROM net.http_get_result(1);

-- PASSO 5: Verificar logs após execução (aguarde alguns segundos)
SELECT 
    msl.id,
    msl.appointment_id,
    mk.code as tipo_mensagem,
    TO_CHAR(msl.scheduled_for AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as scheduled_for_brasilia,
    TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as agora_brasilia,
    msl.status,
    TO_CHAR(msl.sent_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as enviado_brasilia,
    msl.provider_response,
    CASE 
        WHEN msl.status = 'SENT' THEN '✅ MENSAGEM ENVIADA'
        WHEN msl.status = 'FAILED' THEN '❌ FALHA NO ENVIO'
        WHEN msl.status = 'PENDING' AND msl.scheduled_for <= NOW() THEN '⏰ AINDA PENDENTE (ATRASADA)'
        WHEN msl.status = 'PENDING' THEN '⏳ AINDA PENDENTE (AGUARDANDO HORÁRIO)'
        ELSE '❓ STATUS DESCONHECIDO'
    END as status_envio
FROM message_send_log msl
LEFT JOIN message_kinds mk ON mk.id = msl.message_kind_id
WHERE msl.appointment_id = 'e84f26c7-7d14-4a9b-97be-bb01b1235557'
ORDER BY msl.created_at DESC;

-- PASSO 6: Resumo final
SELECT 
    'RESUMO FINAL' as titulo,
    COUNT(*) FILTER (WHERE status = 'PENDING') as total_pending,
    COUNT(*) FILTER (WHERE status = 'SENT') as total_sent,
    COUNT(*) FILTER (WHERE status = 'FAILED') as total_failed,
    COUNT(*) FILTER (WHERE status = 'PENDING' AND scheduled_for <= NOW()) as pending_atrasadas
FROM message_send_log
WHERE appointment_id = 'e84f26c7-7d14-4a9b-97be-bb01b1235557';





















