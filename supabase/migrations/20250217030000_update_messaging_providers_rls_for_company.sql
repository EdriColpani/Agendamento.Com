-- =====================================================
-- ATUALIZAR POLÍTICAS RLS PARA messaging_providers COM company_id
-- =====================================================
-- Mantém acesso de admin global e adiciona acesso de proprietários
-- para visualizar provedor da própria empresa (somente leitura)
-- =====================================================

-- Remover políticas antigas que podem conflitar
DROP POLICY IF EXISTS "authenticated_users_can_view_providers" ON public.messaging_providers;

-- =====================================================
-- POLÍTICA DE SELECT (LEITURA)
-- =====================================================
-- Admin global: vê todos os provedores
-- Proprietários: veem apenas provedor da própria empresa
-- =====================================================
CREATE POLICY "authenticated_users_can_view_providers" 
ON public.messaging_providers
FOR SELECT
TO authenticated
USING (
  -- Admin global pode ver todos
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN ('GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN')
  )
  OR
  -- Proprietários/gestores podem ver provedor da própria empresa
  (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 
      FROM public.user_companies uc
      JOIN public.role_types rt ON uc.role_type = rt.id
      WHERE uc.company_id = messaging_providers.company_id
        AND uc.user_id = auth.uid()
        AND rt.description IN ('Proprietário', 'Admin')
    )
  )
  OR
  -- Provedores globais (company_id NULL) - visíveis para todos autenticados
  -- (mantém compatibilidade com sistema atual)
  company_id IS NULL
);

-- =====================================================
-- POLÍTICAS DE INSERT/UPDATE/DELETE
-- =====================================================
-- Apenas admin global pode criar/editar/excluir
-- (mantém políticas existentes)
-- =====================================================

-- Política de INSERT já existe, mas vamos garantir que está correta
DROP POLICY IF EXISTS "global_admin_can_insert_providers" ON public.messaging_providers;
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

-- Política de UPDATE já existe, mas vamos garantir que está correta
DROP POLICY IF EXISTS "global_admin_can_update_providers" ON public.messaging_providers;
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

-- Política de DELETE já existe, mas vamos garantir que está correta
DROP POLICY IF EXISTS "global_admin_can_delete_providers" ON public.messaging_providers;
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
-- NOTA IMPORTANTE:
-- =====================================================
-- As políticas mantêm compatibilidade com provedores globais
-- (company_id NULL) que podem ser visualizados por todos.
-- Admin global continua tendo acesso total.
-- Proprietários podem apenas visualizar provedor da própria empresa.
-- =====================================================

