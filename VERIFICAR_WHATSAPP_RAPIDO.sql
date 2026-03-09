-- =====================================================
-- VERIFICAÇÃO RÁPIDA: POR QUE O WHATSAPP NÃO ENVIA?
-- Execute no Supabase → SQL Editor
-- =====================================================

-- 1. CHAVE DO CRON (se vazia, a Edge Function retorna 403 e nada é processado)
SELECT 
    '1. CHAVE DO CRON (app_config)' AS secao,
    COALESCE(
        (SELECT CASE 
            WHEN value IS NULL OR TRIM(value) = '' THEN '❌ VAZIO - CRON NÃO AUTENTICA (corrija com INSERT em app_config)'
            ELSE '✅ Configurado (' || length(value) || ' caracteres)'
        END
        FROM app_config WHERE key = 'service_role_key' LIMIT 1),
        '❌ NENHUM REGISTRO - CRON NÃO AUTENTICA (insira service_role_key em app_config)'
    ) AS status;

-- 2. CRON JOB (precisa existir e estar ativo)
SELECT 
    '2. CRON JOB' AS secao,
    jobid,
    jobname,
    schedule,
    active,
    CASE WHEN active THEN '✅ ATIVO' ELSE '❌ INATIVO' END AS status
FROM cron.job
WHERE jobname LIKE '%whatsapp%' OR command LIKE '%whatsapp-message-scheduler%'
ORDER BY jobid;

-- Se não retornar nenhuma linha acima, o cron job NÃO EXISTE (execute a migração do worker).

-- 3. ÚLTIMAS EXECUÇÕES DO CRON (últimas 24h)
SELECT 
    '3. ÚLTIMAS EXECUÇÕES DO CRON' AS secao,
    j.jobname,
    r.start_time,
    r.end_time,
    r.status,
    r.return_message,
    CASE 
        WHEN r.status = 'succeeded' THEN '✅'
        WHEN r.status = 'failed' THEN '❌ FALHOU'
        ELSE r.status
    END AS resultado
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname LIKE '%whatsapp%' OR j.command LIKE '%whatsapp-message-scheduler%'
  AND r.start_time >= NOW() - INTERVAL '24 hours'
ORDER BY r.start_time DESC
LIMIT 15;

-- 4. MENSAGENS PENDENTES QUE JÁ DEVERIAM TER SIDO ENVIADAS
SELECT 
    '4. PENDENTES ATRASADAS' AS secao,
    msl.id,
    msl.appointment_id,
    msl.scheduled_for,
    msl.status,
    NOW() AS agora_utc,
    CASE 
        WHEN msl.scheduled_for::timestamptz <= NOW() THEN '⚠️ DEVERIA TER SIDO ENVIADA'
        ELSE '⏳ Ainda no futuro'
    END AS situacao
FROM message_send_log msl
WHERE msl.status = 'PENDING'
  AND msl.scheduled_for::timestamptz <= NOW()
ORDER BY msl.scheduled_for
LIMIT 20;

-- Se a seção 1 mostrar ❌ VAZIO ou ❌ NENHUM REGISTRO → esta é a causa principal: configure app_config.service_role_key.
-- Se a seção 2 não retornar linhas → cron não existe: aplique a migração do worker.
-- Se a seção 3 mostrar só 'failed' → veja return_message e os logs da Edge Function.
-- Se a seção 4 retornar linhas → há mensagens prontas; se o cron está OK e a chave OK, veja os logs da Edge Function.
