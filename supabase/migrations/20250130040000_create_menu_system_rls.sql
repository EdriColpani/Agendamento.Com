-- =====================================================
-- POLÍTICAS RLS PARA SISTEMA DE MENUS
-- =====================================================

-- =====================================================
-- 1. POLÍTICAS RLS PARA menus
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "authenticated_users_can_view_menus" ON public.menus;
DROP POLICY IF EXISTS "global_admin_can_manage_menus" ON public.menus;
DROP POLICY IF EXISTS "global_admin_can_insert_menus" ON public.menus;
DROP POLICY IF EXISTS "global_admin_can_update_menus" ON public.menus;
DROP POLICY IF EXISTS "global_admin_can_delete_menus" ON public.menus;

-- SELECT: Todos os usuários autenticados podem ver menus ativos
CREATE POLICY "authenticated_users_can_view_menus" 
ON public.menus
FOR SELECT
TO authenticated
USING (is_active = true);

-- INSERT: Apenas Administradores Globais podem criar
CREATE POLICY "global_admin_can_insert_menus" 
ON public.menus
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

-- UPDATE: Apenas Administradores Globais podem atualizar
CREATE POLICY "global_admin_can_update_menus" 
ON public.menus
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

-- DELETE: Apenas Administradores Globais podem deletar
CREATE POLICY "global_admin_can_delete_menus" 
ON public.menus
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
-- 2. POLÍTICAS RLS PARA menu_plans
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.menu_plans ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "authenticated_users_can_view_menu_plans" ON public.menu_plans;
DROP POLICY IF EXISTS "global_admin_can_manage_menu_plans" ON public.menu_plans;
DROP POLICY IF EXISTS "global_admin_can_insert_menu_plans" ON public.menu_plans;
DROP POLICY IF EXISTS "global_admin_can_update_menu_plans" ON public.menu_plans;
DROP POLICY IF EXISTS "global_admin_can_delete_menu_plans" ON public.menu_plans;

-- SELECT: Todos os usuários autenticados podem ver
CREATE POLICY "authenticated_users_can_view_menu_plans" 
ON public.menu_plans
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Apenas Administradores Globais podem criar
CREATE POLICY "global_admin_can_insert_menu_plans" 
ON public.menu_plans
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

-- UPDATE: Apenas Administradores Globais podem atualizar
CREATE POLICY "global_admin_can_update_menu_plans" 
ON public.menu_plans
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

-- DELETE: Apenas Administradores Globais podem deletar
CREATE POLICY "global_admin_can_delete_menu_plans" 
ON public.menu_plans
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
-- 3. POLÍTICAS RLS PARA menu_role_permissions
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.menu_role_permissions ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "users_can_view_own_company_menu_permissions" ON public.menu_role_permissions;
DROP POLICY IF EXISTS "proprietarios_can_manage_menu_permissions" ON public.menu_role_permissions;
DROP POLICY IF EXISTS "proprietarios_can_insert_menu_permissions" ON public.menu_role_permissions;
DROP POLICY IF EXISTS "proprietarios_can_update_menu_permissions" ON public.menu_role_permissions;
DROP POLICY IF EXISTS "proprietarios_can_delete_menu_permissions" ON public.menu_role_permissions;

-- SELECT: Usuários podem ver permissões de suas empresas
CREATE POLICY "users_can_view_own_company_menu_permissions" 
ON public.menu_role_permissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = menu_role_permissions.company_id
      AND uc.user_id = auth.uid()
  )
);

-- INSERT: Apenas Proprietários/Admins da empresa podem criar
CREATE POLICY "proprietarios_can_insert_menu_permissions" 
ON public.menu_role_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = menu_role_permissions.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
  AND EXISTS (
    SELECT 1 
    FROM public.companies c
    WHERE c.id = menu_role_permissions.company_id
  )
);

-- UPDATE: Apenas Proprietários/Admins da empresa podem atualizar
CREATE POLICY "proprietarios_can_update_menu_permissions" 
ON public.menu_role_permissions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = menu_role_permissions.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = menu_role_permissions.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- DELETE: Apenas Proprietários/Admins da empresa podem deletar
CREATE POLICY "proprietarios_can_delete_menu_permissions" 
ON public.menu_role_permissions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = menu_role_permissions.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- =====================================================
-- FIM DAS POLÍTICAS RLS
-- =====================================================

