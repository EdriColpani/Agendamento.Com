-- =====================================================
-- CORRIGIR RLS: PERMITIR CRIAÇÃO PÚBLICA DE AGENDAMENTOS
-- =====================================================
-- Para permitir que a página de convidado (sem autenticação)
-- possa criar agendamentos
-- =====================================================

-- =====================================================
-- TABELA: appointments
-- =====================================================

-- Remover política se já existir
DROP POLICY IF EXISTS "anon_can_insert_appointments" ON public.appointments;

-- Política para INSERT: Permitir criação pública (anon) de agendamentos
CREATE POLICY "anon_can_insert_appointments" 
ON public.appointments
FOR INSERT
TO anon
WITH CHECK (
  -- Permitir criação apenas se o agendamento está associado a uma empresa válida
  company_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM public.companies c
    WHERE c.id = appointments.company_id
      AND c.is_active = true
  )
  -- E se o cliente existe e pertence à mesma empresa
  AND EXISTS (
    SELECT 1 
    FROM public.clients cl
    WHERE cl.id = appointments.client_id
      AND cl.company_id = appointments.company_id
  )
);

-- =====================================================
-- TABELA: appointment_services
-- =====================================================

-- Remover política se já existir
DROP POLICY IF EXISTS "anon_can_insert_appointment_services" ON public.appointment_services;

-- Política para INSERT: Permitir criação pública (anon) de vínculos serviço-agendamento
CREATE POLICY "anon_can_insert_appointment_services" 
ON public.appointment_services
FOR INSERT
TO anon
WITH CHECK (
  -- Permitir criação apenas se o agendamento existe e pertence a uma empresa válida
  EXISTS (
    SELECT 1 
    FROM public.appointments a
    JOIN public.companies c ON c.id = a.company_id
    WHERE a.id = appointment_services.appointment_id
      AND c.is_active = true
  )
  -- E se o serviço existe e pertence à mesma empresa do agendamento
  AND EXISTS (
    SELECT 1 
    FROM public.appointments a
    JOIN public.services s ON s.company_id = a.company_id
    WHERE a.id = appointment_services.appointment_id
      AND s.id = appointment_services.service_id
      AND s.is_active = true
  )
);

