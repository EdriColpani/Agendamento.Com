-- =============================================================================
-- Fase 1 — Arena: tabela courts + appointments (booking_kind, court_id) + RLS
-- Execute no Supabase (SQL editor ou supabase db push).
-- =============================================================================

-- 1) Quadras / recursos por empresa
CREATE TABLE IF NOT EXISTS public.courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT courts_company_name_unique UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_courts_company_id ON public.courts(company_id);
CREATE INDEX IF NOT EXISTS idx_courts_company_active ON public.courts(company_id) WHERE is_active = true;

COMMENT ON TABLE public.courts IS 'Recursos físicos (quadras) para reserva por horário — módulo arena.';

-- updated_at
CREATE OR REPLACE FUNCTION public.set_courts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courts_updated_at ON public.courts;
CREATE TRIGGER trg_courts_updated_at
  BEFORE UPDATE ON public.courts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_courts_updated_at();

-- 2) Extensão de appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_kind TEXT NOT NULL DEFAULT 'service';

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_booking_kind_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_booking_kind_check
  CHECK (booking_kind IN ('service', 'court'));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES public.courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_court_id ON public.appointments(court_id);
CREATE INDEX IF NOT EXISTS idx_appointments_booking_kind ON public.appointments(booking_kind);

COMMENT ON COLUMN public.appointments.booking_kind IS 'service = atendimento; court = uso de quadra.';
COMMENT ON COLUMN public.appointments.court_id IS 'Quadra associada quando booking_kind = court.';

-- 3) RLS courts (mesmo padrão conceitual de services: user_companies ou collaborators)
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_view_courts" ON public.courts;
DROP POLICY IF EXISTS "authenticated_users_can_insert_courts" ON public.courts;
DROP POLICY IF EXISTS "authenticated_users_can_update_courts" ON public.courts;
DROP POLICY IF EXISTS "authenticated_users_can_delete_courts" ON public.courts;

CREATE POLICY "authenticated_users_can_view_courts"
ON public.courts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = courts.company_id AND uc.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = courts.company_id AND c.user_id = auth.uid() AND c.is_active = true
  )
);

CREATE POLICY "authenticated_users_can_insert_courts"
ON public.courts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = courts.company_id AND uc.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = courts.company_id AND c.user_id = auth.uid() AND c.is_active = true
  )
);

CREATE POLICY "authenticated_users_can_update_courts"
ON public.courts FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = courts.company_id AND uc.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = courts.company_id AND c.user_id = auth.uid() AND c.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = courts.company_id AND uc.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = courts.company_id AND c.user_id = auth.uid() AND c.is_active = true
  )
);

CREATE POLICY "authenticated_users_can_delete_courts"
ON public.courts FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = courts.company_id AND uc.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = courts.company_id AND c.user_id = auth.uid() AND c.is_active = true
  )
);
