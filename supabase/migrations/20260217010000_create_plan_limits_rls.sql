-- =====================================================
-- POLÍTICAS RLS PARA plan_limits
-- =====================================================
-- Apenas Global Admin pode gerenciar limites de planos
-- Outros usuários podem apenas visualizar (para validações)
-- =====================================================
-- IMPORTANTE: Esta migração NÃO altera políticas existentes
-- Apenas cria políticas RLS para a nova tabela plan_limits
-- =====================================================

-- Habilitar RLS na tabela plan_limits
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem (para garantir limpeza)
DROP POLICY IF EXISTS "authenticated_users_can_view_plan_limits" ON public.plan_limits;
DROP POLICY IF EXISTS "global_admin_can_insert_plan_limits" ON public.plan_limits;
DROP POLICY IF EXISTS "global_admin_can_update_plan_limits" ON public.plan_limits;
DROP POLICY IF EXISTS "global_admin_can_delete_plan_limits" ON public.plan_limits;

-- SELECT: Todos os usuários autenticados podem ver limites
-- (necessário para validações no sistema)
CREATE POLICY "authenticated_users_can_view_plan_limits" 
ON public.plan_limits
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Apenas Administradores Globais podem criar limites
CREATE POLICY "global_admin_can_insert_plan_limits" 
ON public.plan_limits
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN (
        'GLOBAL_ADMIN', 
        'ADMIN_GLOBAL', 
        'ADMINISTRADOR_GLOBAL', 
        'SUPER_ADMIN'
      )
  )
);

-- UPDATE: Apenas Administradores Globais podem atualizar limites
CREATE POLICY "global_admin_can_update_plan_limits" 
ON public.plan_limits
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN (
        'GLOBAL_ADMIN', 
        'ADMIN_GLOBAL', 
        'ADMINISTRADOR_GLOBAL', 
        'SUPER_ADMIN'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN (
        'GLOBAL_ADMIN', 
        'ADMIN_GLOBAL', 
        'ADMINISTRADOR_GLOBAL', 
        'SUPER_ADMIN'
      )
  )
);

-- DELETE: Apenas Administradores Globais podem deletar limites
CREATE POLICY "global_admin_can_delete_plan_limits" 
ON public.plan_limits
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
      AND UPPER(tu.cod) IN (
        'GLOBAL_ADMIN', 
        'ADMIN_GLOBAL', 
        'ADMINISTRADOR_GLOBAL', 
        'SUPER_ADMIN'
      )
  )
);

-- =====================================================
-- FIM DAS POLÍTICAS RLS
-- =====================================================

