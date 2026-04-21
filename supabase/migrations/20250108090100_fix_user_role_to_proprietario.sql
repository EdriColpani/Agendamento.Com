-- =====================================================
-- CORREÇÃO: Alterar role do usuário de "Barbeiro" para "Proprietário"
-- =====================================================
-- Este script corrige o role do usuário na empresa para permitir cadastro de colaboradores
-- =====================================================

-- 1. Verificar qual é o ID do role "Proprietário"
SELECT id, description 
FROM public.role_types 
WHERE description = 'Proprietário';

-- 2. Verificar qual é o ID do role "Barbeiro" (para confirmar)
SELECT id, description 
FROM public.role_types 
WHERE description = 'Barbeiro';

-- 3. ATUALIZAR o role do usuário para "Proprietário" na empresa
-- IMPORTANTE: Substitua os IDs abaixo pelos valores corretos retornados nas queries acima
UPDATE public.user_companies
SET 
  role_type = (SELECT id FROM public.role_types WHERE description = 'Proprietário' LIMIT 1),
  updated_at = NOW()
WHERE user_id = '3143d9c8-2582-4871-8779-f3e03e359c27'  -- ID do usuário
  AND company_id = '1594effc-0648-4568-965b-bbc5a1b1d5a9';  -- ID da empresa

-- 4. Verificar se a atualização foi bem-sucedida
SELECT 
  uc.user_id,
  uc.company_id,
  uc.role_type,
  rt.description as role_description,
  c.name as company_name
FROM user_companies uc
LEFT JOIN role_types rt ON uc.role_type = rt.id
LEFT JOIN companies c ON uc.company_id = c.id
WHERE uc.user_id = '3143d9c8-2582-4871-8779-f3e03e359c27'
  AND uc.company_id = '1594effc-0648-4568-965b-bbc5a1b1d5a9';

-- 5. Atualizar também o type_user para garantir consistência
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'type_user'
      AND column_name = 'updated_at'
  ) THEN
    UPDATE public.type_user
    SET
      cod = 'PROPRIETARIO',
      descr = 'Proprietário',
      updated_at = NOW()
    WHERE user_id = '3143d9c8-2582-4871-8779-f3e03e359c27';
  ELSE
    UPDATE public.type_user
    SET
      cod = 'PROPRIETARIO',
      descr = 'Proprietário'
    WHERE user_id = '3143d9c8-2582-4871-8779-f3e03e359c27';
  END IF;
END $$;

-- 6. Verificar type_user atualizado
SELECT user_id, cod, descr
FROM public.type_user
WHERE user_id = '3143d9c8-2582-4871-8779-f3e03e359c27';

-- =====================================================
-- FIM DA CORREÇÃO
-- =====================================================
-- Após executar este script, o usuário terá role "Proprietário" 
-- e poderá cadastrar colaboradores
-- =====================================================

