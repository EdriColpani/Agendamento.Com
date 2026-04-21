-- =====================================================
-- POLÍTICAS RLS PARA role_types
-- =====================================================
-- Esta tabela deve ser gerenciada apenas por Administradores Globais
-- =====================================================

-- Habilitar RLS na tabela role_types se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'role_types'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.role_types ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "authenticated_users_can_view_role_types" ON public.role_types;
DROP POLICY IF EXISTS "global_admin_can_manage_role_types" ON public.role_types;
DROP POLICY IF EXISTS "global_admin_can_insert_role_types" ON public.role_types;
DROP POLICY IF EXISTS "global_admin_can_update_role_types" ON public.role_types;
DROP POLICY IF EXISTS "global_admin_can_delete_role_types" ON public.role_types;

-- Política para SELECT: Todos os usuários autenticados podem ver role_types
-- (necessário para dropdowns e outras funcionalidades)
CREATE POLICY "authenticated_users_can_view_role_types" 
ON public.role_types
FOR SELECT
TO authenticated
USING (true); -- Todos os usuários autenticados podem ver

-- Política para INSERT: Apenas Administradores Globais podem criar
CREATE POLICY "global_admin_can_insert_role_types" 
ON public.role_types
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
CREATE POLICY "global_admin_can_update_role_types" 
ON public.role_types
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
CREATE POLICY "global_admin_can_delete_role_types" 
ON public.role_types
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
-- FIM DAS POLÍTICAS RLS
-- =====================================================

