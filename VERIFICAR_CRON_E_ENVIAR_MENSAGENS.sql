-- =====================================================
-- VERIFICAR CRON JOB E FORÇAR ENVIO DAS MENSAGENS
-- =====================================================

-- 1. Verificar se o cron job está configurado
SELECT 
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    jobname
FROM cron.job
WHERE jobname LIKE '%whatsapp%' OR command LIKE '%whatsapp-message-scheduler%';

-- 2. Verificar mensagens PENDING que já deveriam ter sido enviadas
SELECT 
    msl.id,
    msl.appointment_id,
    mk.code as tipo_mensagem,
    TO_CHAR(msl.scheduled_for AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as scheduled_for_brasilia,
    TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as agora_brasilia,
    msl.status,
    EXTRACT(EPOCH FROM (NOW() - msl.scheduled_for)) / 60 as minutos_atrasado,
    CASE 
        WHEN msl.scheduled_for <= NOW() THEN '⏰ JÁ DEVERIA TER SIDO ENVIADO'
        ELSE '⏳ AINDA NÃO É HORA'
    END as status_envio
FROM message_send_log msl
LEFT JOIN message_kinds mk ON mk.id = msl.message_kind_id
WHERE msl.status = 'PENDING'
ORDER BY msl.scheduled_for ASC;

-- 3. Contar mensagens PENDING que já deveriam ter sido enviadas
SELECT 
    COUNT(*) as total_pending_atrasadas,
    COUNT(*) FILTER (WHERE scheduled_for <= NOW()) as ja_deveriam_ter_sido_enviadas
FROM message_send_log
WHERE status = 'PENDING';

-- 4. CHAMAR A EDGE FUNCTION MANUALMENTE VIA pg_net
-- IMPORTANTE: Substitua 'SUA_URL_SUPABASE' pela URL do seu projeto
SELECT net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
) AS request_id;

-- 5. Verificar o resultado da requisição (aguarde alguns segundos após executar o passo 4)
-- Substitua '1' pelo request_id retornado no passo 4
-- SELECT * FROM net.http_get_result(1);

-- 6. Verificar logs após execução manual
SELECT 
    msl.id,
    msl.appointment_id,
    mk.code as tipo_mensagem,
    TO_CHAR(msl.scheduled_for AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as scheduled_for_brasilia,
    msl.status,
    msl.sent_at,
    msl.provider_response,
    CASE 
        WHEN msl.status = 'SENT' THEN '✅ MENSAGEM ENVIADA'
        WHEN msl.status = 'FAILED' THEN '❌ FALHA NO ENVIO'
        WHEN msl.status = 'PENDING' THEN '⏳ AINDA PENDENTE'
        ELSE '❓ STATUS DESCONHECIDO'
    END as status_envio
FROM message_send_log msl
LEFT JOIN message_kinds mk ON mk.id = msl.message_kind_id
WHERE msl.appointment_id = 'e84f26c7-7d14-4a9b-97be-bb01b1235557'
ORDER BY msl.created_at DESC;





















