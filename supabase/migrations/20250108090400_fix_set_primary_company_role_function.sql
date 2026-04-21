-- =====================================================
-- CORREÇÃO: Garantir que set_primary_company_role NÃO altere o role_type
-- =====================================================
-- Esta função deve apenas definir is_primary = true, NUNCA alterar role_type
-- =====================================================

-- Verificar a função atual (execute no SQL Editor para ver)
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'set_primary_company_role';

-- Criar/Substituir função CORRIGIDA que NUNCA altera role_type
CREATE OR REPLACE FUNCTION public.set_primary_company_role(
  p_user_id UUID,
  p_company_id UUID,
  p_role_type_id INTEGER  -- Este parâmetro é mantido para compatibilidade, mas NÃO é usado para alterar role_type
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- CRÍTICO: Esta função APENAS define is_primary = true
  -- Ela NUNCA altera o role_type, mesmo que p_role_type_id seja passado
  
  -- Primeiro, desmarcar todas as empresas primárias do usuário
  UPDATE public.user_companies
  SET 
    is_primary = false,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND is_primary = true;

  -- Depois, marcar a empresa especificada como primária
  -- IMPORTANTE: NÃO alteramos role_type aqui, apenas is_primary
  UPDATE public.user_companies
  SET 
    is_primary = true,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND company_id = p_company_id;

  -- Se não encontrou registro, criar um novo (mas isso não deveria acontecer)
  -- Se acontecer, usar o role_type_id passado, mas isso é um caso excepcional
  IF NOT FOUND THEN
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
      p_role_type_id,  -- Apenas neste caso excepcional de criação
      true,
      NOW(),
      NOW()
    );
  END IF;

  -- IMPORTANTE: Esta função NÃO faz NADA relacionado a company_subscriptions
  -- Ela apenas gerencia is_primary em user_companies
  -- NUNCA altera role_type de registros existentes

END;
$$;

COMMENT ON FUNCTION public.set_primary_company_role(UUID, UUID, INTEGER) IS 
'Função para definir empresa como primária. NÃO altera role_type de registros existentes. Apenas gerencia is_primary.';

-- =====================================================
-- VERIFICAÇÃO: Garantir que não há triggers alterando role_type
-- =====================================================

-- Remover triggers que possam alterar role_type incorretamente
DROP TRIGGER IF EXISTS trg_update_role_on_set_primary ON public.user_companies;
DROP TRIGGER IF EXISTS trg_auto_set_role_on_primary ON public.user_companies;

-- =====================================================
-- FIM DA CORREÇÃO
-- =====================================================
-- Agora set_primary_company_role NUNCA alterará role_type incorretamente
-- =====================================================

