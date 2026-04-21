-- =====================================================
-- FORÇAR ENVIO DE MENSAGENS AGORA
-- =====================================================
-- Execute este SQL para forçar o envio imediato de todas
-- as mensagens PENDING, independente do horário agendado
-- =====================================================

-- 1. VER QUANTAS MENSAGENS PENDENTES EXISTEM
SELECT 
    '=== MENSAGENS PENDENTES ===' as secao,
    COUNT(*) as total_pendentes,
    MIN(scheduled_for AT TIME ZONE 'America/Sao_Paulo') as primeira_agendada,
    MAX(scheduled_for AT TIME ZONE 'America/Sao_Paulo') as ultima_agendada
FROM message_send_log
WHERE status = 'PENDING';

-- 2. CHAMAR A EDGE FUNCTION MANUALMENTE (FORÇA O ENVIO AGORA)
SELECT 
    '=== CHAMANDO EDGE FUNCTION AGORA ===' as secao,
    net.http_post(
        url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    ) AS request_id,
    '✅ Edge Function chamada! Verifique os logs abaixo em 10 segundos.' as instrucao;

-- 3. AGUARDAR 5 SEGUNDOS E VERIFICAR RESULTADO
-- (Execute esta query após 5-10 segundos da anterior)
SELECT 
    '=== RESULTADO DO ENVIO (APÓS 5-10 SEGUNDOS) ===' as secao,
    COUNT(*) FILTER (WHERE status = 'PENDING') as ainda_pendentes,
    COUNT(*) FILTER (WHERE status = 'SENT') as enviadas_agora,
    COUNT(*) FILTER (WHERE status = 'FAILED') as falhadas_agora,
    MAX(sent_at) as ultimo_envio
FROM message_send_log
WHERE updated_at >= NOW() - INTERVAL '1 minute';

-- 4. VER DETALHES DAS MENSAGENS ENVIADAS AGORA
SELECT 
    '=== MENSAGENS ENVIADAS AGORA ===' as secao,
    msl.id,
    msl.appointment_id,
    a.appointment_date,
    a.appointment_time,
    mk.code as tipo_mensagem,
    msl.status,
    msl.sent_at,
    msl.provider_response
FROM message_send_log msl
LEFT JOIN appointments a ON a.id = msl.appointment_id
LEFT JOIN message_kinds mk ON mk.id = msl.message_kind_id
WHERE msl.updated_at >= NOW() - INTERVAL '1 minute'
ORDER BY msl.sent_at DESC;

-- =====================================================
-- INSTRUÇÕES:
-- 1. Execute a query 2 (chamar Edge Function)
-- 2. Aguarde 5-10 segundos
-- 3. Execute as queries 3 e 4 para ver o resultado
-- =====================================================

