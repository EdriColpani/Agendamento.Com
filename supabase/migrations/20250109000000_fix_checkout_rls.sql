-- =====================================================
-- CORREÇÃO: Políticas RLS para tabelas de checkout
-- =====================================================
-- Garantir que usuários possam finalizar atendimentos e registrar transações
-- de empresas onde eles têm um papel (user_companies)
-- =====================================================

-- =====================================================
-- 1. CORREÇÃO: Políticas RLS para tabela `cash_movements`
-- =====================================================

-- Habilitar RLS na tabela `cash_movements` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'cash_movements'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "users_can_view_cash_movements" ON public.cash_movements;
DROP POLICY IF EXISTS "users_can_insert_cash_movements" ON public.cash_movements;
DROP POLICY IF EXISTS "users_can_update_cash_movements" ON public.cash_movements;
DROP POLICY IF EXISTS "authenticated_users_can_view_cash_movements" ON public.cash_movements;
DROP POLICY IF EXISTS "authenticated_users_can_insert_cash_movements" ON public.cash_movements;
DROP POLICY IF EXISTS "authenticated_users_can_update_cash_movements" ON public.cash_movements;

-- Política para SELECT: Usuários podem ver movimentações de caixa de suas empresas
CREATE POLICY "authenticated_users_can_view_cash_movements" 
ON public.cash_movements
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da movimentação
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_movements.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Usuários podem criar movimentações de caixa para suas empresas
CREATE POLICY "authenticated_users_can_insert_cash_movements" 
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da movimentação
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_movements.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para UPDATE: Usuários podem atualizar movimentações de caixa de suas empresas
CREATE POLICY "authenticated_users_can_update_cash_movements" 
ON public.cash_movements
FOR UPDATE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da movimentação
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_movements.company_id
      AND uc.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da movimentação (após atualização)
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_movements.company_id
      AND uc.user_id = auth.uid()
  )
);

-- =====================================================
-- 2. CORREÇÃO: Políticas RLS para tabela `transaction_products`
-- =====================================================

-- Habilitar RLS na tabela `transaction_products` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'transaction_products'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.transaction_products ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "users_can_view_transaction_products" ON public.transaction_products;
DROP POLICY IF EXISTS "users_can_insert_transaction_products" ON public.transaction_products;
DROP POLICY IF EXISTS "authenticated_users_can_view_transaction_products" ON public.transaction_products;
DROP POLICY IF EXISTS "authenticated_users_can_insert_transaction_products" ON public.transaction_products;

-- Política para SELECT: Usuários podem ver produtos de transações de suas empresas
CREATE POLICY "authenticated_users_can_view_transaction_products" 
ON public.transaction_products
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da transação
  EXISTS (
    SELECT 1 
    FROM public.cash_movements cm
    JOIN public.user_companies uc ON uc.company_id = cm.company_id
    WHERE cm.id = transaction_products.transaction_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Usuários podem criar produtos de transações para suas empresas
CREATE POLICY "authenticated_users_can_insert_transaction_products" 
ON public.transaction_products
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da transação
  EXISTS (
    SELECT 1 
    FROM public.cash_movements cm
    JOIN public.user_companies uc ON uc.company_id = cm.company_id
    WHERE cm.id = transaction_products.transaction_id
      AND uc.user_id = auth.uid()
  )
);

-- =====================================================
-- 3. CORREÇÃO: Políticas RLS para UPDATE em `appointments`
-- =====================================================
-- Garantir que usuários possam atualizar status de agendamentos para 'concluido'

-- Verificar se já existe política de UPDATE para appointments
-- Se não existir, criar uma que permita atualizar status para usuários da empresa

DROP POLICY IF EXISTS "authenticated_users_can_update_appointments" ON public.appointments;
DROP POLICY IF EXISTS "users_can_update_appointments" ON public.appointments;

-- Política para UPDATE: Usuários podem atualizar agendamentos de suas empresas
CREATE POLICY "authenticated_users_can_update_appointments" 
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do agendamento
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = appointments.company_id
      AND uc.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa do agendamento (após atualização)
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = appointments.company_id
      AND uc.user_id = auth.uid()
  )
);

-- =====================================================
-- FIM DA CORREÇÃO RLS
-- =====================================================

