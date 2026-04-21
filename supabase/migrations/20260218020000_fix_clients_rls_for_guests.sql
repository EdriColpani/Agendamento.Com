-- =====================================================
-- CORRIGIR RLS: PERMITIR CRIAÇÃO PÚBLICA DE CLIENTES
-- =====================================================
-- Para permitir que a página de convidado (sem autenticação)
-- possa criar clientes ao fazer agendamento
-- =====================================================

-- Remover políticas se já existirem
DROP POLICY IF EXISTS "anon_can_insert_clients" ON public.clients;
DROP POLICY IF EXISTS "anon_can_view_clients" ON public.clients;

-- Política para INSERT: Permitir criação pública (anon) de clientes
-- Apenas para a página de convidado criar clientes ao agendar
CREATE POLICY "anon_can_insert_clients" 
ON public.clients
FOR INSERT
TO anon
WITH CHECK (
  -- Permitir criação apenas se o cliente está associado a uma empresa válida e ativa
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM public.companies c
    WHERE c.id = clients.company_id
      AND c.is_active = true
  )
);

-- Política para SELECT: Permitir leitura pública (anon) de clientes
-- Para buscar clientes existentes pelo telefone
CREATE POLICY "anon_can_view_clients" 
ON public.clients
FOR SELECT
TO anon
USING (
  -- Permitir leitura apenas de clientes associados a empresas ativas
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM public.companies c
    WHERE c.id = clients.company_id
      AND c.is_active = true
  )
);

