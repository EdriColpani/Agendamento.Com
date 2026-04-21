-- =====================================================
-- PROCESSAR MENSAGEM PENDENTE MANUALMENTE
-- =====================================================
-- Este script força o processamento da mensagem pendente
-- =====================================================

-- 1. Verificar mensagem pendente
SELECT 
    '=== MENSAGEM PENDENTE ===' as secao,
    msl.id,
    msl.appointment_id,
    a.appointment_date,
    a.appointment_time,
    cl.name as cliente,
    cl.phone as telefone,
    mk.code as tipo_mensagem,
    msl.scheduled_for AT TIME ZONE 'America/Sao_Paulo' as scheduled_for_brasilia,
    NOW() AT TIME ZONE 'America/Sao_Paulo' as agora_brasilia,
    msl.status
FROM message_send_log msl
LEFT JOIN appointments a ON a.id = msl.appointment_id
LEFT JOIN clients cl ON cl.id = msl.client_id
LEFT JOIN message_kinds mk ON mk.id = msl.message_kind_id
WHERE msl.status = 'PENDING'
  AND msl.scheduled_for::timestamp <= NOW()
ORDER BY msl.scheduled_for
LIMIT 5;

-- 2. Chamar Edge Function manualmente para processar
-- Isso força o processamento imediato
SELECT 
    '=== CHAMANDO EDGE FUNCTION ===' as secao,
    net.http_post(
        url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || get_service_role_key()
        ),
        body := jsonb_build_object(
            'source', 'manual_trigger',
            'timestamp', extract(epoch from now())::text
        )
    ) AS request_id;

-- 3. Aguardar 2 segundos e verificar resultado
-- (Execute este SELECT após alguns segundos)
SELECT 
    '=== RESULTADO APÓS PROCESSAMENTO ===' as secao,
    msl.id,
    cl.name as cliente,
    msl.status,
    msl.sent_at AT TIME ZONE 'America/Sao_Paulo' as sent_at_brasilia,
    msl.provider_response,
    CASE 
        WHEN msl.status = 'SENT' THEN '✅ ENVIADA'
        WHEN msl.status = 'FAILED' THEN '❌ FALHOU'
        WHEN msl.status = 'PENDING' THEN '⏳ AINDA PENDENTE'
        ELSE '❓ ' || msl.status
    END as resultado
FROM message_send_log msl
LEFT JOIN clients cl ON cl.id = msl.client_id
WHERE msl.id = '8ebc70e8-fdb6-427c-a3f9-5b278c4986f4'; -- ID da mensagem pendente



















