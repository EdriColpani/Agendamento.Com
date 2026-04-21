-- =====================================================
-- POLÍTICAS RLS para módulo de Mensagens WhatsApp
-- =====================================================
-- Garantir que gestores/proprietários possam gerenciar
-- templates, regras de envio e configurações de mensagens
-- de suas empresas
-- =====================================================

-- =====================================================
-- 1. POLÍTICAS RLS para `company_message_templates`
-- =====================================================

-- Habilitar RLS na tabela `company_message_templates` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'company_message_templates'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.company_message_templates ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "authenticated_users_can_view_templates" ON public.company_message_templates;
DROP POLICY IF EXISTS "authenticated_users_can_insert_templates" ON public.company_message_templates;
DROP POLICY IF EXISTS "authenticated_users_can_update_templates" ON public.company_message_templates;
DROP POLICY IF EXISTS "authenticated_users_can_delete_templates" ON public.company_message_templates;

-- Política para SELECT: Usuários podem ver templates de suas empresas
CREATE POLICY "authenticated_users_can_view_templates" 
ON public.company_message_templates
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do template
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = company_message_templates.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Gestores/Proprietários podem criar templates para suas empresas
CREATE POLICY "authenticated_users_can_insert_templates" 
ON public.company_message_templates
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa do template
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_templates.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- Política para UPDATE: Gestores/Proprietários podem atualizar templates de suas empresas
CREATE POLICY "authenticated_users_can_update_templates" 
ON public.company_message_templates
FOR UPDATE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do template
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_templates.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
)
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa do template (após atualização)
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_templates.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- Política para DELETE: Gestores/Proprietários podem deletar templates de suas empresas
CREATE POLICY "authenticated_users_can_delete_templates" 
ON public.company_message_templates
FOR DELETE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do template
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_templates.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- =====================================================
-- 2. POLÍTICAS RLS para `company_message_schedules`
-- =====================================================

-- Habilitar RLS na tabela `company_message_schedules` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'company_message_schedules'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.company_message_schedules ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "authenticated_users_can_view_schedules" ON public.company_message_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_insert_schedules" ON public.company_message_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_update_schedules" ON public.company_message_schedules;
DROP POLICY IF EXISTS "authenticated_users_can_delete_schedules" ON public.company_message_schedules;

-- Política para SELECT: Usuários podem ver regras de envio de suas empresas
CREATE POLICY "authenticated_users_can_view_schedules" 
ON public.company_message_schedules
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da regra
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = company_message_schedules.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Gestores/Proprietários podem criar regras de envio para suas empresas
CREATE POLICY "authenticated_users_can_insert_schedules" 
ON public.company_message_schedules
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da regra
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_schedules.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- Política para UPDATE: Gestores/Proprietários podem atualizar regras de envio de suas empresas
CREATE POLICY "authenticated_users_can_update_schedules" 
ON public.company_message_schedules
FOR UPDATE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da regra
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_schedules.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
)
WITH CHECK (
  -- Verificar se o usuário tem um papel na empresa da regra (após atualização)
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_schedules.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- Política para DELETE: Gestores/Proprietários podem deletar regras de envio de suas empresas
CREATE POLICY "authenticated_users_can_delete_schedules" 
ON public.company_message_schedules
FOR DELETE
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa da regra
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.company_id = company_message_schedules.company_id
      AND uc.user_id = auth.uid()
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- =====================================================
-- 3. POLÍTICAS RLS para `message_send_log`
-- =====================================================

-- Habilitar RLS na tabela `message_send_log` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'message_send_log'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.message_send_log ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "authenticated_users_can_view_logs" ON public.message_send_log;
DROP POLICY IF EXISTS "authenticated_users_can_insert_logs" ON public.message_send_log;
DROP POLICY IF EXISTS "authenticated_users_can_update_logs" ON public.message_send_log;
DROP POLICY IF EXISTS "block_direct_log_inserts" ON public.message_send_log;
DROP POLICY IF EXISTS "block_direct_log_updates" ON public.message_send_log;

-- Política para SELECT: Usuários podem ver logs de envio de suas empresas
CREATE POLICY "authenticated_users_can_view_logs" 
ON public.message_send_log
FOR SELECT
TO authenticated
USING (
  -- Verificar se o usuário tem um papel na empresa do log
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = message_send_log.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política para INSERT: Apenas Edge Functions (service_role) podem inserir logs
CREATE POLICY "block_direct_log_inserts" 
ON public.message_send_log
FOR INSERT
TO authenticated
WITH CHECK (false); -- Bloqueia inserções diretas do frontend

-- Política para UPDATE: Apenas Edge Functions (service_role) podem atualizar logs
CREATE POLICY "block_direct_log_updates" 
ON public.message_send_log
FOR UPDATE
TO authenticated
USING (false); -- Bloqueia atualizações diretas do frontend

-- =====================================================
-- 4. POLÍTICAS RLS para `messaging_providers`
-- =====================================================
-- Esta tabela é GLOBAL e deve ser gerenciada apenas por Administradores Globais
-- =====================================================

-- Habilitar RLS na tabela `messaging_providers` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'messaging_providers'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.messaging_providers ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "authenticated_users_can_view_providers" ON public.messaging_providers;
DROP POLICY IF EXISTS "global_admin_can_manage_providers" ON public.messaging_providers;

-- Política para SELECT: Todos os usuários autenticados podem ver provedores ativos
CREATE POLICY "authenticated_users_can_view_providers" 
ON public.messaging_providers
FOR SELECT
TO authenticated
USING (is_active = true); -- Apenas provedores ativos são visíveis

-- Política para INSERT/UPDATE/DELETE: Apenas Administradores Globais podem gerenciar
-- (Será implementada via Edge Function com service_role, não via RLS direto)

-- =====================================================
-- 5. POLÍTICAS RLS para `message_kinds`
-- =====================================================
-- Esta tabela é GLOBAL e apenas leitura para gestores
-- =====================================================

-- Habilitar RLS na tabela `message_kinds` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'message_kinds'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.message_kinds ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "authenticated_users_can_view_message_kinds" ON public.message_kinds;

-- Política para SELECT: Todos os usuários autenticados podem ver tipos de mensagem
CREATE POLICY "authenticated_users_can_view_message_kinds" 
ON public.message_kinds
FOR SELECT
TO authenticated
USING (true); -- Leitura pública para usuários autenticados

-- =====================================================
-- 6. POLÍTICA RLS para campo `whatsapp_messaging_enabled` em `companies`
-- =====================================================
-- Permitir que gestores/proprietários atualizem o flag de habilitação
-- =====================================================

-- A política de UPDATE já existe em companies, mas vamos garantir que o campo seja atualizável
-- A política existente "proprietario_admin_can_update_companies" já cobre isso

-- =====================================================
-- FIM DAS POLÍTICAS RLS PARA MÓDULO DE MENSAGENS
-- =====================================================

-- =====================================================
-- POPULAR TIPOS DE MENSAGEM INICIAIS (OPCIONAL)
-- =====================================================
-- Execute apenas se a tabela message_kinds estiver vazia
-- =====================================================

INSERT INTO message_kinds (code, default_name, description)
VALUES
  ('APPOINTMENT_REMINDER', 'Lembrete de Agendamento', 'Lembrete de Agendamento'),
  ('APPOINTMENT_CONFIRMATION', 'Confirmação de Agendamento', 'Confirmação de Agendamento'),
  ('APPOINTMENT_CANCELLATION', 'Cancelamento de Agendamento', 'Cancelamento de Agendamento')
ON CONFLICT (code) DO NOTHING;

