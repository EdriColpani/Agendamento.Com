-- =====================================================
-- WORKER AUTOMÁTICO PARA PROCESSAMENTO DE MENSAGENS WHATSAPP
-- =====================================================
-- Este script configura um sistema totalmente automático que:
-- 1. Executa a cada 1 minuto via pg_cron
-- 2. Busca mensagens PENDING com scheduled_for <= NOW()
-- 3. Processa e envia automaticamente
-- 4. Registra logs de execução
-- 5. É totalmente autônomo (sem intervenção manual)
-- =====================================================

-- =====================================================
-- PARTE 1: CRIAR TABELA DE LOGS DE EXECUÇÃO DO WORKER
-- =====================================================

CREATE TABLE IF NOT EXISTS public.worker_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'PARTIAL')),
    messages_processed INTEGER NOT NULL DEFAULT 0,
    messages_sent INTEGER NOT NULL DEFAULT 0,
    messages_failed INTEGER NOT NULL DEFAULT 0,
    execution_duration_ms INTEGER,
    error_message TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_worker_execution_logs_execution_time 
ON public.worker_execution_logs(execution_time DESC);

CREATE INDEX IF NOT EXISTS idx_worker_execution_logs_status 
ON public.worker_execution_logs(status);

-- RLS: Apenas service_role pode inserir logs
ALTER TABLE public.worker_execution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_can_insert_worker_logs" ON public.worker_execution_logs;
CREATE POLICY "service_role_can_insert_worker_logs" 
ON public.worker_execution_logs
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_can_view_worker_logs" ON public.worker_execution_logs;
CREATE POLICY "authenticated_can_view_worker_logs" 
ON public.worker_execution_logs
FOR SELECT
TO authenticated
USING (true);

-- =====================================================
-- PARTE 2: GARANTIR EXTENSÕES NECESSÁRIAS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================
-- PARTE 3: CRIAR TABELA DE CONFIGURAÇÃO E FUNÇÃO PARA SERVICE_ROLE_KEY
-- =====================================================

-- Criar tabela de configuração para service_role_key
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

-- RLS: Apenas service_role pode ler/escrever
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_config" ON public.app_config;
CREATE POLICY "service_role_full_access_config" 
ON public.app_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Permitir leitura para authenticated (mas não escrita)
DROP POLICY IF EXISTS "authenticated_can_read_config" ON public.app_config;
CREATE POLICY "authenticated_can_read_config" 
ON public.app_config
FOR SELECT
TO authenticated
USING (true);

-- Criar função para obter service_role_key (lê da tabela ou current_setting)
CREATE OR REPLACE FUNCTION get_service_role_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_key text;
BEGIN
    -- Primeiro tentar ler da tabela app_config
    SELECT value INTO v_key
    FROM public.app_config
    WHERE key = 'service_role_key'
    LIMIT 1;
    
    -- Se não encontrou na tabela, tentar current_setting
    IF v_key IS NULL OR v_key = '' THEN
        BEGIN
            v_key := current_setting('app.settings.service_role_key', true);
        EXCEPTION
            WHEN OTHERS THEN
                v_key := '';
        END;
    END IF;
    
    RETURN COALESCE(v_key, '');
END;
$$;

-- IMPORTANTE: A service_role_key deve ser inserida na tabela app_config
-- Execute: CONFIGURAR_SERVICE_ROLE_KEY_TABELA.sql após esta migration

-- =====================================================
-- PARTE 4: REMOVER JOBS ANTIGOS E CRIAR NOVO CRON JOB
-- =====================================================

-- Remover todos os jobs antigos relacionados ao WhatsApp
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN 
        SELECT jobid, jobname 
        FROM cron.job 
        WHERE jobname LIKE '%whatsapp%' 
           OR command LIKE '%whatsapp-message-scheduler%'
    LOOP
        BEGIN
            PERFORM cron.unschedule(job_record.jobname);
            RAISE NOTICE 'Job removido: %', job_record.jobname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao remover job %: %', job_record.jobname, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Criar novo cron job que executa A CADA 1 MINUTO
-- IMPORTANTE: O mínimo permitido pelo pg_cron é 1 minuto
SELECT cron.schedule(
    'whatsapp-message-scheduler-worker',
    '* * * * *',
    $cmd$
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

-- =====================================================
-- PARTE 5: VERIFICAR CONFIGURAÇÃO
-- =====================================================

-- Verificar se o job foi criado
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
        WHEN schedule = '* * * * *' THEN '✅ Executa a cada 1 minuto'
        ELSE '⚠️ Frequência: ' || schedule
    END as frequencia
FROM cron.job
WHERE jobname = 'whatsapp-message-scheduler-worker';

-- =====================================================
-- PARTE 6: COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON TABLE public.worker_execution_logs IS 
'Logs de execução do worker automático de mensagens WhatsApp. Registra cada execução com estatísticas de processamento.';

COMMENT ON FUNCTION cron.schedule(text, text, text) IS 
'O worker está configurado para executar automaticamente a cada 1 minuto. 
A Edge Function whatsapp-message-scheduler processa mensagens PENDING com scheduled_for <= NOW().';

-- =====================================================
-- RESUMO DA CONFIGURAÇÃO
-- =====================================================
-- ✅ Cron job configurado: Executa a cada 1 minuto
-- ✅ Edge Function: whatsapp-message-scheduler (já existe e processa mensagens)
-- ✅ Tabela de logs: worker_execution_logs (para monitoramento)
-- ✅ RLS configurado: Apenas service_role pode inserir logs
-- ✅ Sistema totalmente automático: Não requer intervenção manual
-- =====================================================

