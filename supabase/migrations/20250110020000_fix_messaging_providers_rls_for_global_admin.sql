-- =====================================================
-- CORRIGIR POLÍTICAS RLS PARA messaging_providers
-- =====================================================
-- Permitir que Administradores Globais possam gerenciar provedores
-- =====================================================

-- Remover política antiga de SELECT que só mostra ativos
DROP POLICY IF EXISTS "authenticated_users_can_view_providers" ON public.messaging_providers;
DROP POLICY IF EXISTS "global_admin_can_insert_providers" ON public.messaging_providers;
DROP POLICY IF EXISTS "global_admin_can_update_providers" ON public.messaging_providers;
DROP POLICY IF EXISTS "global_admin_can_delete_providers" ON public.messaging_providers;

-- Política para SELECT: Todos podem ver provedores (global admin precisa ver todos, inclusive inativos)
CREATE POLICY "authenticated_users_can_view_providers" 
ON public.messaging_providers
FOR SELECT
TO authenticated
USING (true); -- Todos os usuários autenticados podem ver

-- Política para INSERT: Apenas Administradores Globais podem criar
CREATE POLICY "global_admin_can_insert_providers" 
ON public.messaging_providers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN ('GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN')
  )
);

-- Política para UPDATE: Apenas Administradores Globais podem atualizar
CREATE POLICY "global_admin_can_update_providers" 
ON public.messaging_providers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN ('GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN ('GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN')
  )
);

-- Política para DELETE: Apenas Administradores Globais podem deletar
CREATE POLICY "global_admin_can_delete_providers" 
ON public.messaging_providers
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN ('GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- FIM DA CORREÇÃO RLS PARA messaging_providers
-- =====================================================

