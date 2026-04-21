-- =====================================================
-- Adicionar política RLS para DELETE em cash_register_closures
-- =====================================================
-- Permite que usuários autenticados deletem fechamentos de caixa
-- de empresas onde têm acesso (através de user_companies)
-- =====================================================

-- Política RLS: Usuários podem deletar fechamentos de suas empresas
DROP POLICY IF EXISTS "authenticated_users_can_delete_cash_register_closures" ON public.cash_register_closures;
CREATE POLICY "authenticated_users_can_delete_cash_register_closures"
ON public.cash_register_closures
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_register_closures.company_id
      AND uc.user_id = auth.uid()
  )
);









