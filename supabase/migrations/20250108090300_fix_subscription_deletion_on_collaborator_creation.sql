-- =====================================================
-- CORREÇÃO CRÍTICA: Prevenir deleção de assinatura ao cadastrar colaborador
-- =====================================================
-- Este script garante que a função assign_user_to_company NUNCA afete company_subscriptions
-- e protege a tabela company_subscriptions contra deleções acidentais
-- =====================================================

-- =====================================================
-- PARTE 1: GARANTIR FUNÇÃO assign_user_to_company SEGURA
-- =====================================================
-- Substitui a função por uma versão que NUNCA mexe em company_subscriptions

CREATE OR REPLACE FUNCTION public.assign_user_to_company(
  p_user_id UUID,
  p_company_id UUID,
  p_role_type_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_record_id UUID;
BEGIN
  -- Verificar se já existe um registro para este user_id e company_id
  SELECT id INTO v_existing_record_id
  FROM public.user_companies
  WHERE user_id = p_user_id
    AND company_id = p_company_id
  LIMIT 1;

  IF v_existing_record_id IS NOT NULL THEN
    -- Atualizar registro existente
    UPDATE public.user_companies
    SET 
      role_type = p_role_type_id,
      updated_at = NOW()
    WHERE id = v_existing_record_id;
  ELSE
    -- Criar novo registro
    INSERT INTO public.user_companies (
      user_id,
      company_id,
      role_type,
      is_primary,
      created_at,
      updated_at
    )
    VALUES (
      p_user_id,
      p_company_id,
      p_role_type_id,
      false, -- Não definir como primária automaticamente
      NOW(),
      NOW()
    );
  END IF;

  -- CRÍTICO: Esta função NÃO faz NADA relacionado a company_subscriptions
  -- Ela apenas gerencia a relação user_companies
  -- Nenhuma lógica de plano/assinatura deve estar aqui

END;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION public.assign_user_to_company(UUID, UUID, INTEGER) IS 
'Função segura para associar usuário a empresa. NÃO mexe em company_subscriptions. Apenas gerencia user_companies.';

-- =====================================================
-- PARTE 2: REMOVER TRIGGERS PROBLEMÁTICOS
-- =====================================================
-- Remove qualquer trigger que possa deletar company_subscriptions automaticamente

-- Remover triggers em company_subscriptions que possam deletar registros
DROP TRIGGER IF EXISTS trg_delete_subscription_on_user_change ON public.company_subscriptions;
DROP TRIGGER IF EXISTS trg_cleanup_subscription ON public.company_subscriptions;

-- Remover triggers em user_companies que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_update_subscription_on_user_company_change ON public.user_companies;
DROP TRIGGER IF EXISTS trg_delete_subscription_on_user_company_delete ON public.user_companies;

-- Remover triggers em collaborators que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_delete_subscription_on_collaborator_create ON public.collaborators;
DROP TRIGGER IF EXISTS trg_update_subscription_on_collaborator_change ON public.collaborators;

-- =====================================================
-- PARTE 3: PROTEÇÃO RLS PARA company_subscriptions
-- =====================================================
-- Garantir que apenas operações autorizadas possam deletar assinaturas

-- Verificar se RLS está habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'company_subscriptions'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam permitir deleção acidental
DROP POLICY IF EXISTS "allow_delete_subscription" ON public.company_subscriptions;
DROP POLICY IF EXISTS "users_can_delete_own_subscription" ON public.company_subscriptions;

-- Criar política que IMPEDE deleção via RLS para usuários autenticados
-- service_role não passa por RLS, então apenas Edge Functions podem deletar
-- Esta política bloqueia deleções diretas do frontend/cliente
CREATE POLICY "prevent_accidental_deletion_subscriptions" 
ON public.company_subscriptions
FOR DELETE
USING (false); -- Bloqueia TODAS as deleções via RLS (apenas service_role pode deletar)

-- Permitir leitura e escrita para usuários autorizados (ajustar conforme necessário)
-- Mas NUNCA permitir deleção direta via RLS

-- =====================================================
-- PARTE 4: VERIFICAÇÃO E LOG DE INTEGRIDADE
-- =====================================================
-- Criar função de auditoria para monitorar mudanças em company_subscriptions

CREATE OR REPLACE FUNCTION public.audit_subscription_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log de deleções (não deve acontecer exceto via Edge Functions)
  IF TG_OP = 'DELETE' THEN
    RAISE WARNING 'AUDITORIA: Tentativa de deleção de assinatura. company_id: %, subscription_id: %', 
      OLD.company_id, OLD.id;
    -- Não impedir, mas logar para investigação
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Criar trigger de auditoria (apenas para monitoramento, não impede nada)
DROP TRIGGER IF EXISTS trg_audit_subscription_changes ON public.company_subscriptions;
CREATE TRIGGER trg_audit_subscription_changes
BEFORE DELETE OR UPDATE ON public.company_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.audit_subscription_changes();

-- =====================================================
-- FIM DA CORREÇÃO
-- =====================================================
-- Esta migração garante que:
-- 1. assign_user_to_company NUNCA mexe em company_subscriptions
-- 2. Triggers problemáticos são removidos
-- 3. RLS protege contra deleções acidentais
-- 4. Auditoria monitora mudanças
-- =====================================================

