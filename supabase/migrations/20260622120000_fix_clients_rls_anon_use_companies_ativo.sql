-- =====================================================
-- RLS em clients: política antiga usava companies.is_active,
-- mas o schema do app usa companies.ativo — o EXISTS nunca
-- satisfeita → 403 em SELECT/INSERT para anon (reserva pública / convidado).
-- =====================================================

DROP POLICY IF EXISTS "anon_can_insert_clients" ON public.clients;
DROP POLICY IF EXISTS "anon_can_view_clients" ON public.clients;

-- INSERT: convidado sem login; alinhar a empresa ativa (coluna ativo)
CREATE POLICY "anon_can_insert_clients"
ON public.clients
FOR INSERT
TO anon
WITH CHECK (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = clients.company_id
      AND c.ativo = true
  )
);

-- SELECT: busca por telefone antes de inserir
CREATE POLICY "anon_can_view_clients"
ON public.clients
FOR SELECT
TO anon
USING (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = clients.company_id
      AND c.ativo = true
  )
);
