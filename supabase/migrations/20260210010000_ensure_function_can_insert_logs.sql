-- =====================================================
-- GARANTIR QUE FUNÇÃO PODE INSERIR EM message_send_log
-- =====================================================
-- A função schedule_whatsapp_messages_for_appointment
-- usa SECURITY DEFINER, então executa com permissões
-- do owner. Vamos garantir que ela tenha permissões
-- corretas e que as políticas RLS não a bloqueiem.
-- =====================================================

-- 1. Verificar se a função existe e quem é o owner
DO $$
DECLARE
    v_function_owner TEXT;
    v_function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'schedule_whatsapp_messages_for_appointment'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        SELECT pg_get_userbyid(proowner) INTO v_function_owner
        FROM pg_proc
        WHERE proname = 'schedule_whatsapp_messages_for_appointment';
        
        RAISE NOTICE 'Função existe. Owner: %', v_function_owner;
    ELSE
        RAISE NOTICE 'Função NÃO existe. Execute a migração 20260210_schedule_whatsapp_messages_on_appointment.sql';
    END IF;
END $$;

-- 2. Garantir que a função seja executada com permissões adequadas
-- Funções SECURITY DEFINER executam com permissões do owner (geralmente postgres)
-- e não são afetadas por políticas RLS para authenticated users.

-- 3. Verificar políticas RLS atuais
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    CASE 
        WHEN qual IS NOT NULL THEN 'Tem condição USING'
        ELSE 'Sem condição USING'
    END as has_using,
    CASE 
        WHEN with_check IS NOT NULL THEN 'Tem condição WITH CHECK'
        ELSE 'Sem condição WITH CHECK'
    END as has_with_check
FROM pg_policies
WHERE tablename = 'message_send_log';

-- 4. IMPORTANTE: Funções SECURITY DEFINER executam como o owner da função
-- Se o owner for postgres ou service_role, elas têm permissões totais
-- e não são afetadas por políticas RLS para authenticated users.
-- 
-- Se ainda houver problemas, podemos:
-- a) Garantir que a função seja criada pelo usuário correto (postgres)
-- b) Ou criar uma política RLS específica que permite inserções via função
--    (mas isso é mais complexo e geralmente não é necessário)

-- 5. Verificar se RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN 'RLS está HABILITADO'
        ELSE 'RLS está DESABILITADO'
    END as status_rls
FROM pg_tables
WHERE tablename = 'message_send_log';

