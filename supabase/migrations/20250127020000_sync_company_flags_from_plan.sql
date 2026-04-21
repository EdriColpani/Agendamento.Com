-- =====================================================
-- Função para sincronizar flags da empresa baseado no plano
-- =====================================================
-- Esta função atualiza os flags na tabela companies
-- baseado nas funcionalidades do plano da assinatura
-- =====================================================

CREATE OR REPLACE FUNCTION sync_company_flags_from_plan(p_company_id UUID, p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    feature_flag_name TEXT;
    flags_to_update JSONB := '{}'::JSONB;
    flag_key TEXT;
    flag_value BOOLEAN;
BEGIN
    -- Buscar todas as funcionalidades do plano que têm company_flag_name definido
    FOR feature_flag_name IN
        SELECT DISTINCT f.company_flag_name
        FROM plan_features pf
        JOIN features f ON pf.feature_id = f.id
        WHERE pf.plan_id = p_plan_id
          AND f.company_flag_name IS NOT NULL
          AND f.company_flag_name != ''
    LOOP
        -- Adicionar flag para ser habilitado
        flags_to_update := flags_to_update || jsonb_build_object(feature_flag_name, true);
    END LOOP;

    -- Se o plano não tem funcionalidades com flags, desabilitar todos os flags conhecidos
    -- (ou manter os atuais - você pode ajustar essa lógica conforme necessário)
    -- Por enquanto, apenas atualizamos os flags que estão nas funcionalidades do plano

    -- Atualizar os flags na tabela companies
    -- Usamos uma abordagem dinâmica para atualizar apenas os flags que existem
    IF jsonb_object_keys(flags_to_update) IS NOT NULL THEN
        -- Construir e executar UPDATE dinâmico
        -- Como não podemos fazer UPDATE dinâmico direto, vamos fazer por flag conhecido
        
        -- WhatsApp Messaging
        IF flags_to_update ? 'whatsapp_messaging_enabled' THEN
            UPDATE companies 
            SET whatsapp_messaging_enabled = (flags_to_update->>'whatsapp_messaging_enabled')::BOOLEAN
            WHERE id = p_company_id;
        END IF;
        
        -- Adicione mais flags aqui conforme necessário
        -- Exemplo:
        -- IF flags_to_update ? 'client_registration_enabled' THEN
        --     UPDATE companies 
        --     SET client_registration_enabled = (flags_to_update->>'client_registration_enabled')::BOOLEAN
        --     WHERE id = p_company_id;
        -- END IF;
    END IF;

    -- Desabilitar flags que não estão nas funcionalidades do plano
    -- Buscar flags que a empresa tem habilitados mas não estão no plano
    -- Por enquanto, vamos apenas desabilitar whatsapp_messaging_enabled se não estiver no plano
    IF NOT (flags_to_update ? 'whatsapp_messaging_enabled') THEN
        UPDATE companies 
        SET whatsapp_messaging_enabled = false
        WHERE id = p_company_id
          AND whatsapp_messaging_enabled = true;
    END IF;

    -- Adicione lógica similar para outros flags conforme necessário

END;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION sync_company_flags_from_plan(UUID, UUID) IS 
'Sincroniza os flags da tabela companies baseado nas funcionalidades do plano. Deve ser chamada quando uma assinatura é criada ou atualizada.';

-- =====================================================
-- Trigger para sincronizar flags automaticamente
-- =====================================================
-- Opcional: pode ser ativado para sincronizar automaticamente
-- quando uma assinatura é criada ou o plan_id é atualizado
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_sync_company_flags()
RETURNS TRIGGER AS $$
BEGIN
    -- Sincronizar flags quando assinatura é criada ou plan_id é atualizado
    IF NEW.status = 'active' AND NEW.plan_id IS NOT NULL THEN
        PERFORM sync_company_flags_from_plan(NEW.company_id, NEW.plan_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger (comentado por padrão - descomente se quiser execução automática)
-- CREATE TRIGGER trg_sync_company_flags_on_subscription
-- AFTER INSERT OR UPDATE OF plan_id, status ON company_subscriptions
-- FOR EACH ROW
-- WHEN (NEW.status = 'active')
-- EXECUTE FUNCTION trigger_sync_company_flags();

-- Comentário sobre o trigger
COMMENT ON FUNCTION trigger_sync_company_flags() IS 
'Trigger function para sincronizar flags automaticamente. O trigger está comentado - descomente se quiser execução automática via trigger.';

