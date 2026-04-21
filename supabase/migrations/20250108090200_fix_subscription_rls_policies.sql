-- =====================================================
-- CORREÇÃO: Políticas RLS para company_subscriptions
-- =====================================================
-- Garantir que usuários possam VER suas assinaturas ativas
-- =====================================================

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "users_can_view_own_subscriptions" ON public.company_subscriptions;
DROP POLICY IF EXISTS "authenticated_users_can_view_subscriptions" ON public.company_subscriptions;
DROP POLICY IF EXISTS "proprietarios_can_view_subscriptions" ON public.company_subscriptions;
DROP POLICY IF EXISTS "authenticated_users_can_view_company_subscriptions" ON public.company_subscriptions;
DROP POLICY IF EXISTS "block_direct_subscription_inserts" ON public.company_subscriptions;
DROP POLICY IF EXISTS "block_direct_subscription_updates" ON public.company_subscriptions;

-- Criar política que permite usuários autenticados verem assinaturas de suas empresas
-- Um usuário pode ver assinaturas de empresas onde ele tem um papel (user_companies)
CREATE POLICY "authenticated_users_can_view_company_subscriptions" 
ON public.company_subscriptions
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da assinatura
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = company_subscriptions.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT (apenas via Edge Functions com service_role)
-- Usuários autenticados NÃO podem inserir diretamente
CREATE POLICY "block_direct_subscription_inserts" 
ON public.company_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (false); -- Bloqueia inserções diretas do frontend

-- Política para UPDATE (apenas via Edge Functions com service_role)
-- Usuários autenticados NÃO podem atualizar diretamente
CREATE POLICY "block_direct_subscription_updates" 
ON public.company_subscriptions
FOR UPDATE
TO authenticated
USING (false); -- Bloqueia atualizações diretas do frontend

-- Política para DELETE já existe (block_all_subscription_deletions)
-- Não precisa criar novamente

-- =====================================================
-- FIM DA CORREÇÃO RLS
-- =====================================================
-- Agora usuários autenticados podem:
-- - VER assinaturas de empresas onde têm papel (SELECT)
-- - NÃO podem inserir, atualizar ou deletar (apenas Edge Functions)
-- =====================================================

