-- =====================================================
-- CORREÇÃO: Políticas RLS para tabela `companies`
-- =====================================================
-- Garantir que usuários possam VER o `image_url` da empresa
-- =====================================================

-- Habilitar RLS na tabela `companies` se não estiver habilitado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'companies'
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Remover políticas antigas que possam estar bloqueando a leitura
DROP POLICY IF EXISTS "companies_read_policy" ON public.companies;
DROP POLICY IF EXISTS "allow_public_read_companies" ON public.companies;
DROP POLICY IF EXISTS "allow_all_read_companies" ON public.companies;

-- Política: Permitir que usuários autenticados e não autenticados (público) 
-- possam ler todos os campos da tabela `companies`
-- Isso é essencial para a página de seleção de empresas e exibição de logos
CREATE POLICY "allow_all_read_companies"
ON public.companies
FOR SELECT
TO public
USING (true); -- Permite a leitura de todos os registros e colunas

-- Adicionar políticas para INSERT, UPDATE e DELETE se não existirem
-- Exemplo: apenas usuários com role 'Proprietário' ou 'Admin' podem modificar
-- Você pode ajustar essas políticas conforme suas regras de negócio

-- Política para INSERT (Exemplo: apenas Proprietários ou Admins podem criar empresas)
DROP POLICY IF EXISTS "proprietario_admin_can_insert_companies" ON public.companies;
CREATE POLICY "proprietario_admin_can_insert_companies"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = companies.id
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- Política para UPDATE (Exemplo: apenas Proprietários ou Admins podem atualizar suas empresas)
DROP POLICY IF EXISTS "proprietario_admin_can_update_companies" ON public.companies;
CREATE POLICY "proprietario_admin_can_update_companies"
ON public.companies
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = companies.id
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- Política para DELETE (Exemplo: apenas Proprietários ou Admins podem deletar suas empresas)
DROP POLICY IF EXISTS "proprietario_admin_can_delete_companies" ON public.companies;
CREATE POLICY "proprietario_admin_can_delete_companies"
ON public.companies
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = companies.id
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  )
);

-- =====================================================
-- VERIFICAÇÃO: Verificar URLs das imagens no banco de dados
-- =====================================================

-- Execute esta query manualmente no Supabase SQL Editor:
SELECT id, name, image_url FROM public.companies WHERE image_url IS NOT NULL AND image_url != '';
-- Se a imagem ainda não aparecer no frontend, verifique se as URLs retornadas aqui estão corretas

-- =====================================================
-- FIM DA CORREÇÃO RLS para `companies`
-- =====================================================

