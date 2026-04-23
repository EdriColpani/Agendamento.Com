-- ============================================================================
-- Reserva pública (/reservar-quadra) com USUÁRIO LOGADO: o JWT usa role
-- "authenticated", não "anon". As políticas antigas só em TO anon → 403
-- em SELECT/INSERT em clients (findOrCreateClient).
-- Espelha a mesma regra de 20260622120000 (companies.ativo = true).
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_public_guest_insert_clients" ON public.clients;
DROP POLICY IF EXISTS "authenticated_public_guest_select_clients" ON public.clients;

CREATE POLICY "authenticated_public_guest_insert_clients"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = clients.company_id
      AND c.ativo = true
  )
);

CREATE POLICY "authenticated_public_guest_select_clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = clients.company_id
      AND c.ativo = true
  )
);
