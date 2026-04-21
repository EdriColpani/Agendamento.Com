-- =====================================================
-- RESOLVER ENVIO DE MENSAGENS AGORA - DIAGNÓSTICO COMPLETO
-- =====================================================
-- Execute este SQL para diagnosticar e resolver o problema
-- =====================================================

-- 1. VERIFICAR CRON JOB (QUEM DISPARA O ENVIO)
SELECT 
    '=== CRON JOB (QUEM DISPARA) ===' as secao,
    jobid,
    jobname,
    schedule,
    active,
    CASE 
        WHEN active = true THEN '✅ ATIVO'
        ELSE '❌ INATIVO - PROBLEMA AQUI!'
    END as status,
    LEFT(command, 150) as comando_preview
FROM cron.job
WHERE jobname LIKE '%whatsapp%' 
   OR command LIKE '%whatsapp-message-scheduler%';

-- 2. VERIFICAR ÚLTIMAS EXECUÇÕES DO CRON
SELECT 
    '=== ÚLTIMAS EXECUÇÕES DO CRON ===' as secao,
    start_time,
    end_time,
    status,
    return_message,
    CASE 
        WHEN status = 'succeeded' THEN '✅ SUCESSO'
        WHEN status = 'failed' THEN '❌ FALHOU - PROBLEMA!'
        ELSE '⏳ EM EXECUÇÃO'
    END as status_detalhado
FROM cron.job_run_details
WHERE jobid IN (
    SELECT jobid FROM cron.job 
    WHERE jobname LIKE '%whatsapp%' 
       OR command LIKE '%whatsapp-message-scheduler%'
)
ORDER BY start_time DESC
LIMIT 5;

-- 3. VERIFICAR PROVEDOR DE WHATSAPP (QUEM ENVIA)
SELECT 
    '=== PROVEDOR DE WHATSAPP ===' as secao,
    id,
    name,
    channel,
    is_active,
    base_url,
    http_method,
    CASE 
        WHEN is_active = true AND channel = 'WHATSAPP' THEN '✅ CONFIGURADO'
        ELSE '❌ NÃO CONFIGURADO - PROBLEMA!'
    END as status
FROM messaging_providers
WHERE channel = 'WHATSAPP'
ORDER BY is_active DESC, created_at DESC
LIMIT 1;

-- 4. VERIFICAR MENSAGENS PENDENTES (O QUE DEVERIA SER ENVIADO)
SELECT 
    '=== MENSAGENS PENDENTES (DEVERIAM SER ENVIADAS) ===' as secao,
    msl.id,
    msl.appointment_id,
    a.appointment_date,
    a.appointment_time,
    mk.code as tipo_mensagem,
    msl.scheduled_for,
    msl.scheduled_for AT TIME ZONE 'America/Sao_Paulo' as scheduled_for_brasilia,
    msl.status,
    CASE 
        WHEN msl.status = 'PENDING' AND msl.scheduled_for::timestamp <= NOW() THEN '⚠️ DEVERIA TER SIDO ENVIADA JÁ!'
        WHEN msl.status = 'PENDING' THEN '⏳ AGUARDANDO HORÁRIO'
        WHEN msl.status = 'SENT' THEN '✅ JÁ FOI ENVIADA'
        WHEN msl.status = 'FAILED' THEN '❌ FALHOU'
        ELSE '❓ STATUS DESCONHECIDO'
    END as status_detalhado
FROM message_send_log msl
LEFT JOIN appointments a ON a.id = msl.appointment_id
LEFT JOIN message_kinds mk ON mk.id = msl.message_kind_id
WHERE msl.status = 'PENDING'
ORDER BY msl.scheduled_for
LIMIT 20;

-- 5. CONTAR MENSAGENS POR STATUS
SELECT 
    '=== RESUMO DE MENSAGENS ===' as secao,
    COUNT(*) FILTER (WHERE status = 'PENDING') as pendentes,
    COUNT(*) FILTER (WHERE status = 'SENT') as enviadas,
    COUNT(*) FILTER (WHERE status = 'FAILED') as falhadas,
    COUNT(*) FILTER (WHERE status = 'CANCELLED') as canceladas,
    COUNT(*) as total
FROM message_send_log;

-- 6. VERIFICAR EMPRESAS COM WHATSAPP HABILITADO
SELECT 
    '=== EMPRESAS COM WHATSAPP HABILITADO ===' as secao,
    id,
    name,
    whatsapp_messaging_enabled,
    CASE 
        WHEN whatsapp_messaging_enabled = true THEN '✅ HABILITADO'
        ELSE '❌ DESABILITADO'
    END as status
FROM companies
WHERE whatsapp_messaging_enabled = true;

-- 7. TESTAR MANUALMENTE A EDGE FUNCTION (EXECUTAR AGORA)
-- Esta query chama a Edge Function manualmente para testar
SELECT 
    '=== TESTE MANUAL DA EDGE FUNCTION ===' as secao,
    net.http_post(
        url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    ) AS request_id,
    '✅ FUNÇÃO CHAMADA - VERIFIQUE OS LOGS DA EDGE FUNCTION' as instrucao;

-- 8. VERIFICAR SE HÁ AGENDAMENTOS RECENTES SEM LOGS
SELECT 
    '=== AGENDAMENTOS RECENTES SEM LOGS ===' as secao,
    a.id,
    a.appointment_date,
    a.appointment_time,
    cl.name as cliente,
    cl.phone,
    a.status,
    a.created_at,
    CASE 
        WHEN c.whatsapp_messaging_enabled = FALSE THEN '❌ WHATSAPP DESABILITADO'
        WHEN cl.phone IS NULL OR cl.phone = '00000000000' THEN '❌ SEM TELEFONE'
        WHEN NOT EXISTS (
            SELECT 1 FROM company_message_schedules cms 
            WHERE cms.company_id = a.company_id 
            AND cms.channel = 'WHATSAPP' 
            AND cms.is_active = TRUE
        ) THEN '❌ SEM REGRAS CONFIGURADAS'
        ELSE '⚠️ LOGS NÃO FORAM CRIADOS'
    END as possivel_causa
FROM appointments a
JOIN companies c ON c.id = a.company_id
LEFT JOIN clients cl ON cl.id = a.client_id
WHERE a.created_at >= CURRENT_DATE - INTERVAL '2 days'
  AND a.status NOT IN ('cancelado', 'desistencia')
  AND NOT EXISTS (
      SELECT 1 FROM message_send_log msl 
      WHERE msl.appointment_id = a.id
  )
ORDER BY a.created_at DESC
LIMIT 10;

-- =====================================================
-- FIM DO DIAGNÓSTICO
-- =====================================================

