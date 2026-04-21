-- =====================================================
-- CORRIGIR RLS: PERMITIR LEITURA PÚBLICA DE COLLABORATOR_SERVICES
-- =====================================================
-- Para permitir que a página de convidado (sem autenticação)
-- possa visualizar serviços disponíveis por colaborador
-- =====================================================

-- Remover política se já existir
DROP POLICY IF EXISTS "anon_can_view_collaborator_services" ON public.collaborator_services;

-- Política para SELECT: Permitir leitura pública (anon) de collaborator_services
CREATE POLICY "anon_can_view_collaborator_services" 
ON public.collaborator_services
FOR SELECT
TO anon
USING (
  active = true
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

