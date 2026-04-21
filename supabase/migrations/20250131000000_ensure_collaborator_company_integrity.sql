-- =====================================================
-- GARANTIR INTEGRIDADE: Colaborador sempre vinculado à empresa
-- =====================================================
-- Este script garante que:
-- 1. company_id é NOT NULL na tabela collaborators
-- 2. Trigger força company_id baseado no usuário logado
-- 3. RLS policies garantem isolamento por empresa
-- =====================================================

-- 1. Garantir que company_id seja NOT NULL
DO $$
BEGIN
  -- Verificar se a coluna existe e se permite NULL
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'collaborators' 
    AND column_name = 'company_id'
    AND is_nullable = 'YES'
  ) THEN
    -- Primeiro, atualizar registros órfãos (se houver) - definir como NULL temporariamente
    -- Depois tornar NOT NULL
    ALTER TABLE public.collaborators 
    ALTER COLUMN company_id SET NOT NULL;
    
    RAISE NOTICE 'Coluna company_id agora é NOT NULL';
  ELSE
    RAISE NOTICE 'Coluna company_id já é NOT NULL ou não existe';
  END IF;
END $$;

-- 2. Criar função para obter company_id do usuário logado
CREATE OR REPLACE FUNCTION public.get_user_company_id(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Buscar empresa primária do usuário
  SELECT company_id INTO v_company_id
  FROM public.user_companies
  WHERE user_id = p_user_id
    AND is_primary = true
  LIMIT 1;
  
  -- Se não encontrou primária, buscar qualquer empresa
  IF v_company_id IS NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.user_companies
    WHERE user_id = p_user_id
    LIMIT 1;
  END IF;
  
  RETURN v_company_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_company_id(UUID) IS 
'Retorna o company_id do usuário logado (primeiro primária, depois qualquer empresa)';

-- 3. Criar trigger para garantir company_id antes de INSERT
-- NOTA: Este trigger apenas garante que company_id não seja NULL
-- A validação de permissões é feita na Edge Function antes de chamar o insert
-- Quando chamado via service_role (Edge Function), auth.uid() pode ser NULL
CREATE OR REPLACE FUNCTION public.ensure_collaborator_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_company_id UUID;
BEGIN
  -- Se company_id não está definido, tentar buscar do usuário logado (se disponível)
  -- Mas como a Edge Function já valida e preenche, isso é apenas uma segurança extra
  IF NEW.company_id IS NULL THEN
    -- Se auth.uid() estiver disponível, tentar buscar
    IF auth.uid() IS NOT NULL THEN
      v_user_company_id := public.get_user_company_id(auth.uid());
      
      IF v_user_company_id IS NOT NULL THEN
        NEW.company_id := v_user_company_id;
      ELSE
        -- Se não conseguiu identificar, lançar erro
        RAISE EXCEPTION 'Não foi possível identificar a empresa. O campo company_id é obrigatório.';
      END IF;
    ELSE
      -- Se auth.uid() não está disponível (service_role), lançar erro
      -- A Edge Function deve sempre preencher company_id antes de inserir
      RAISE EXCEPTION 'O campo company_id é obrigatório e não foi fornecido.';
    END IF;
  END IF;
  
  -- Se chegou aqui, company_id está definido
  RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trg_ensure_collaborator_company_id ON public.collaborators;

-- Criar trigger antes de INSERT
CREATE TRIGGER trg_ensure_collaborator_company_id
BEFORE INSERT ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.ensure_collaborator_company_id();

COMMENT ON TRIGGER trg_ensure_collaborator_company_id ON public.collaborators IS 
'Garante que company_id seja sempre preenchido com a empresa do usuário logado';

-- Criar trigger para UPDATE que impede alteração de company_id
CREATE OR REPLACE FUNCTION public.prevent_collaborator_company_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Impedir alteração de company_id
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Não é permitido alterar o company_id de um colaborador.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trg_prevent_collaborator_company_id_change ON public.collaborators;

-- Criar trigger antes de UPDATE
CREATE TRIGGER trg_prevent_collaborator_company_id_change
BEFORE UPDATE ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.prevent_collaborator_company_id_change();

COMMENT ON TRIGGER trg_prevent_collaborator_company_id_change ON public.collaborators IS 
'Impede que company_id seja alterado após a criação do colaborador';

-- 4. Habilitar RLS na tabela collaborators se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'collaborators'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS habilitado na tabela collaborators';
  ELSE
    RAISE NOTICE 'RLS já está habilitado na tabela collaborators';
  END IF;
END $$;

-- 5. Remover políticas antigas
DROP POLICY IF EXISTS "users_can_view_own_company_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "users_can_insert_own_company_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "users_can_update_own_company_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "users_can_delete_own_company_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "authenticated_users_can_view_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "authenticated_users_can_insert_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "authenticated_users_can_update_collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "authenticated_users_can_delete_collaborators" ON public.collaborators;

-- 6. Criar políticas RLS para garantir isolamento por empresa

-- SELECT: Usuários podem ver colaboradores apenas de empresas onde têm um papel
CREATE POLICY "users_can_view_own_company_collaborators"
ON public.collaborators
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = collaborators.company_id
      AND uc.user_id = auth.uid()
  )
);

-- INSERT: Usuários podem criar colaboradores apenas em empresas onde têm um papel
-- NOTA: Edge Functions usando service_role bypassam RLS automaticamente
-- Esta política é apenas para inserções diretas do frontend (que não devem acontecer)
CREATE POLICY "users_can_insert_own_company_collaborators"
ON public.collaborators
FOR INSERT
TO authenticated
WITH CHECK (
  -- Se company_id está definido, validar que o usuário tem acesso
  collaborators.company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = collaborators.company_id
      AND uc.user_id = auth.uid()
  )
);

-- UPDATE: Usuários podem atualizar colaboradores apenas de empresas onde têm um papel
-- Nota: Não podemos usar NEW/OLD em políticas RLS, então criamos um trigger separado para validar que company_id não seja alterado
CREATE POLICY "users_can_update_own_company_collaborators"
ON public.collaborators
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = collaborators.company_id
      AND uc.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = collaborators.company_id
      AND uc.user_id = auth.uid()
  )
);

-- DELETE: Usuários podem deletar colaboradores apenas de empresas onde têm um papel
CREATE POLICY "users_can_delete_own_company_collaborators"
ON public.collaborators
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = collaborators.company_id
      AND uc.user_id = auth.uid()
  )
);

-- =====================================================
-- FIM DA GARANTIA DE INTEGRIDADE
-- =====================================================

