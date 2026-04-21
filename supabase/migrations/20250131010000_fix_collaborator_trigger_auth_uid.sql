-- =====================================================
-- CORREÇÃO: Trigger de colaborador não funciona com service_role
-- =====================================================
-- O trigger estava usando auth.uid() que é NULL quando chamado via service_role
-- Esta correção simplifica o trigger para apenas garantir que company_id não seja NULL
-- =====================================================

-- Corrigir função do trigger
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

COMMENT ON FUNCTION public.ensure_collaborator_company_id() IS 
'Garante que company_id não seja NULL. Quando chamado via service_role (Edge Function), a Edge Function já deve ter preenchido o company_id.';

