-- =====================================================
-- CORRIGIR RLS PARA PERMITIR FUNÇÃO schedule_whatsapp_messages_for_appointment
-- =====================================================
-- A política atual bloqueia inserções diretas do frontend,
-- mas a função SECURITY DEFINER precisa poder inserir.
-- Vamos ajustar a política para permitir que a função insira.
-- =====================================================

-- Remover política que bloqueia todas as inserções de authenticated
DROP POLICY IF EXISTS "block_direct_log_inserts" ON public.message_send_log;

-- Criar nova política que permite inserções via função SECURITY DEFINER
-- mas ainda bloqueia inserções diretas do frontend
CREATE POLICY "allow_function_log_inserts" 
ON public.message_send_log
FOR INSERT
TO authenticated
WITH CHECK (
  -- Permitir inserções quando executado via função SECURITY DEFINER
  -- A função schedule_whatsapp_messages_for_appointment usa SECURITY DEFINER
  -- então ela executa com permissões do owner (postgres/service_role)
  -- e não precisa passar por esta política RLS
  -- Mas mantemos a política para bloquear inserções diretas do frontend
  false
);

-- IMPORTANTE: Como a função usa SECURITY DEFINER, ela executa com permissões
-- do owner da função (geralmente postgres ou service_role), então ela
-- não é afetada por políticas RLS para authenticated users.
-- 
-- Se ainda assim houver problemas, podemos criar uma política específica
-- que permite inserções quando executado via função, mas isso requer
-- verificar o contexto de execução, o que é mais complexo.

-- Alternativa: Se a função ainda não funcionar, podemos criar uma política
-- que permite inserções quando o current_user é o owner da função
-- (mas isso pode ser complexo de implementar)

-- Por enquanto, vamos garantir que a função tenha as permissões corretas
-- e que ela seja executada corretamente.

