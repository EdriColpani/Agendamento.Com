-- =====================================================
-- CORREÇÃO: Políticas RLS para tabela `working_schedules`
-- =====================================================
-- Garantir que usuários possam gerenciar horários de colaboradores
-- de empresas onde eles têm um papel (user_companies)
-- =====================================================

-- Habilitar RLS na tabela `working_schedules` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'working_schedules'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.working_schedules ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "users_can_view_working_schedules" ON public.working_schedules;
DROP POLICY IF EXISTS "users_can_manage_working_schedules" ON public.working_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_view_working_schedules" ON public.working_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_insert_working_schedules" ON public.working_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_update_working_schedules" ON public.working_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_delete_working_schedules" ON public.working_schedules;

-- Política para SELECT: Usuários podem ver horários de colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_view_working_schedules" 
ON public.working_schedules
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do horário
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = working_schedules.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Usuários podem criar horários para colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_insert_working_schedules" 
ON public.working_schedules
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa do horário
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = working_schedules.company_id
      AND uc.user_id = auth.uid()
  )
  -- Verificar se o colaborador pertence à mesma empresa
  AND EXISTS (
    SELECT 1 
    FROM public.collaborators c
    WHERE c.id = working_schedules.collaborator_id
      AND c.company_id = working_schedules.company_id
  )
);

-- Política para UPDATE: Usuários podem atualizar horários de colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_update_working_schedules" 
ON public.working_schedules
FOR UPDATE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do horário
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = working_schedules.company_id
      AND uc.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa do horário (após atualização)
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = working_schedules.company_id
      AND uc.user_id = auth.uid()
  )
  -- Verificar se o colaborador pertence à mesma empresa (após atualização)
  AND EXISTS (
    SELECT 1 
    FROM public.collaborators c
    WHERE c.id = working_schedules.collaborator_id
      AND c.company_id = working_schedules.company_id
  )
);

-- Política para DELETE: Usuários podem deletar horários de colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_delete_working_schedules" 
ON public.working_schedules
FOR DELETE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do horário
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = working_schedules.company_id
      AND uc.user_id = auth.uid()
  )
);

-- =====================================================
-- CORREÇÃO: Políticas RLS para tabela `schedule_exceptions`
-- =====================================================
-- Garantir que usuários possam gerenciar exceções de horário de colaboradores
-- de empresas onde eles têm um papel (user_companies)
-- =====================================================

-- Habilitar RLS na tabela `schedule_exceptions` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'schedule_exceptions'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "users_can_view_schedule_exceptions" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "users_can_manage_schedule_exceptions" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "authenticated_users_can_view_schedule_exceptions" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "authenticated_users_can_insert_schedule_exceptions" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "authenticated_users_can_update_schedule_exceptions" ON public.schedule_exceptions;
DROP POLICY IF EXISTS "authenticated_users_can_delete_schedule_exceptions" ON public.schedule_exceptions;

-- Política para SELECT: Usuários podem ver exceções de horário de colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_view_schedule_exceptions" 
ON public.schedule_exceptions
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da exceção
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = schedule_exceptions.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Usuários podem criar exceções de horário para colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_insert_schedule_exceptions" 
ON public.schedule_exceptions
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da exceção
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = schedule_exceptions.company_id
      AND uc.user_id = auth.uid()
  )
  -- Verificar se o colaborador pertence à mesma empresa
  AND EXISTS (
    SELECT 1 
    FROM public.collaborators c
    WHERE c.id = schedule_exceptions.collaborator_id
      AND c.company_id = schedule_exceptions.company_id
  )
);

-- Política para UPDATE: Usuários podem atualizar exceções de horário de colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_update_schedule_exceptions" 
ON public.schedule_exceptions
FOR UPDATE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da exceção
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = schedule_exceptions.company_id
      AND uc.user_id = auth.uid()
  )
)
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da exceção (após atualização)
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = schedule_exceptions.company_id
      AND uc.user_id = auth.uid()
  )
  -- Verificar se o colaborador pertence à mesma empresa (após atualização)
  AND EXISTS (
    SELECT 1 
    FROM public.collaborators c
    WHERE c.id = schedule_exceptions.collaborator_id
      AND c.company_id = schedule_exceptions.company_id
  )
);

-- Política para DELETE: Usuários podem deletar exceções de horário de colaboradores de suas empresas
CREATE POLICY "authenticated_users_can_delete_schedule_exceptions" 
ON public.schedule_exceptions
FOR DELETE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da exceção
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = schedule_exceptions.company_id
      AND uc.user_id = auth.uid()
  )
);

-- =====================================================
-- FIM DA CORREÇÃO RLS
-- =====================================================

