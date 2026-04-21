-- =====================================================
-- PERMITIR LEITURA PÚBLICA DE collaborator_services
-- =====================================================
-- Para permitir que a página de convidado (sem autenticação)
-- possa consultar os serviços de um colaborador
-- =====================================================

-- Política para SELECT: Permitir leitura pública (anon) de collaborator_services
-- Apenas para consultar serviços ativos de colaboradores
DROP POLICY IF EXISTS "anon_can_view_collaborator_services" ON public.collaborator_services;
CREATE POLICY "anon_can_view_collaborator_services" 
ON public.collaborator_services
FOR SELECT
TO anon
USING (
  -- Permitir consulta apenas de registros ativos
  active = true
  -- E apenas se o colaborador e serviço pertencem à mesma empresa
  AND EXISTS (
    SELECT 1 
    FROM public.collaborators c
    WHERE c.id = collaborator_services.collaborator_id
      AND c.company_id = collaborator_services.company_id
      AND c.is_active = true
  )
  AND EXISTS (
    SELECT 1 
    FROM public.services s
    WHERE s.id = collaborator_services.service_id
      AND s.company_id = collaborator_services.company_id
      AND s.is_active = true
  )
);

-- =====================================================
-- FIM DA POLÍTICA PÚBLICA para `collaborator_services`
-- =====================================================

