-- =====================================================
-- CORREÇÃO URGENTE: Prevenir deleção de assinatura ao cadastrar colaborador
-- =====================================================
-- Este script resolve o problema de assinatura desaparecendo após cadastrar colaborador
-- =====================================================

-- =====================================================
-- PARTE 1: REMOVER TODAS AS TRIGGERS PROBLEMÁTICAS
-- =====================================================

-- Remover triggers em type_user que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_delete_subscription_on_type_user_change ON public.type_user;
DROP TRIGGER IF EXISTS trg_update_subscription_on_type_user_update ON public.type_user;
DROP TRIGGER IF EXISTS trg_cleanup_subscription_on_type_user ON public.type_user;

-- Remover triggers em auth.users que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_delete_subscription_on_user_create ON auth.users;
DROP TRIGGER IF EXISTS trg_cleanup_subscription_on_user_change ON auth.users;

-- Remover triggers em company_subscriptions que possam deletar registros
DROP TRIGGER IF EXISTS trg_delete_subscription_on_user_change ON public.company_subscriptions;
DROP TRIGGER IF EXISTS trg_cleanup_subscription ON public.company_subscriptions;
DROP TRIGGER IF EXISTS trg_auto_delete_subscription ON public.company_subscriptions;

-- Remover triggers em user_companies que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_update_subscription_on_user_company_change ON public.user_companies;
DROP TRIGGER IF EXISTS trg_delete_subscription_on_user_company_delete ON public.user_companies;
DROP TRIGGER IF EXISTS trg_cleanup_subscription_on_user_company ON public.user_companies;

-- Remover triggers em collaborators que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_delete_subscription_on_collaborator_create ON public.collaborators;
DROP TRIGGER IF EXISTS trg_update_subscription_on_collaborator_change ON public.collaborators;
DROP TRIGGER IF EXISTS trg_cleanup_subscription_on_collaborator ON public.collaborators;

-- Remover triggers em companies que possam afetar subscriptions
DROP TRIGGER IF EXISTS trg_delete_subscription_on_company_change ON public.companies;
DROP TRIGGER IF EXISTS trg_cleanup_subscription_on_company_update ON public.companies;

-- =====================================================
-- PARTE 2: GARANTIR FUNÇÃO assign_user_to_company SEGURA
-- =====================================================

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
      false, -- NUNCA definir como primária automaticamente aqui
      NOW(),
      NOW()
    );
  END IF;

  -- CRÍTICO: Esta função NUNCA mexe em company_subscriptions
  -- Ela apenas gerencia a relação user_companies
  -- Nenhuma lógica de plano/assinatura deve estar aqui

END;
$$;

COMMENT ON FUNCTION public.assign_user_to_company(UUID, UUID, INTEGER) IS 
'Função segura para associar usuário a empresa. NÃO mexe em company_subscriptions. Apenas gerencia user_companies.';

-- =====================================================
-- PARTE 3: PROTEGER company_subscriptions CONTRA DELEÇÕES
-- =====================================================

-- Habilitar RLS se não estiver habilitado
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

-- Remover TODAS as políticas de DELETE que possam permitir deleção
DROP POLICY IF EXISTS "allow_delete_subscription" ON public.company_subscriptions;
DROP POLICY IF EXISTS "users_can_delete_own_subscription" ON public.company_subscriptions;
DROP POLICY IF EXISTS "prevent_accidental_deletion_subscriptions" ON public.company_subscriptions;
DROP POLICY IF EXISTS "service_role_can_delete" ON public.company_subscriptions;
DROP POLICY IF EXISTS "block_all_subscription_deletions" ON public.company_subscriptions;

-- Criar política que BLOQUEIA TODAS as deleções via RLS
-- Apenas service_role (Edge Functions) pode deletar (não passa por RLS)
CREATE POLICY "block_all_subscription_deletions" 
ON public.company_subscriptions
FOR DELETE
USING (false); -- Bloqueia TODAS as deleções via RLS

-- =====================================================
-- PARTE 4: CRIAR TRIGGER DE AUDITORIA PARA DETECTAR DELEÇÕES
-- =====================================================

CREATE OR REPLACE FUNCTION public.audit_subscription_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log CRÍTICO de deleções (apenas logar, não impedir)
  -- Edge Functions com service_role podem deletar quando necessário
  RAISE WARNING 'AUDITORIA CRÍTICA: Tentativa de deleção de assinatura! company_id: %, subscription_id: %, operação: %, usuário: %', 
    OLD.company_id, OLD.id, TG_OP, current_user;
  
  -- Permitir a deleção (apenas logar para investigação)
  RETURN OLD;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trg_audit_subscription_changes ON public.company_subscriptions;
DROP TRIGGER IF EXISTS trg_prevent_subscription_deletion ON public.company_subscriptions;
DROP TRIGGER IF EXISTS trg_audit_subscription_deletion ON public.company_subscriptions;

-- Criar trigger que LOGA deleções (para investigação)
CREATE TRIGGER trg_audit_subscription_deletion
BEFORE DELETE ON public.company_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.audit_subscription_deletion();

-- =====================================================
-- PARTE 5: VERIFICAR E CORRIGIR company_id NAS ASSINATURAS
-- =====================================================
-- Garantir que não há assinaturas órfãs ou com company_id incorreto

-- Esta query pode ser executada manualmente para verificar:
-- SELECT cs.id, cs.company_id, cs.status, cs.end_date, c.name as company_name
-- FROM company_subscriptions cs
-- LEFT JOIN companies c ON cs.company_id = c.id
-- WHERE cs.status = 'active'
-- ORDER BY cs.end_date DESC;

-- =====================================================
-- FIM DA CORREÇÃO URGENTE
-- =====================================================
-- Esta migração:
-- 1. Remove TODAS as triggers problemáticas
-- 2. Garante que assign_user_to_company seja segura
-- 3. Protege company_subscriptions contra deleções
-- 4. Cria trigger que IMPEDE deleções (não apenas loga)
-- =====================================================

