-- Fase 2 — Horário de funcionamento por quadra + duração de slot por quadra

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (slot_duration_minutes > 0 AND slot_duration_minutes <= 24 * 60);

COMMENT ON COLUMN public.courts.slot_duration_minutes IS
  'Tamanho do slot de reserva em minutos (ex.: 60 para blocos de 1h).';

CREATE TABLE IF NOT EXISTS public.court_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT court_working_hours_day_unique UNIQUE (court_id, day_of_week),
  CONSTRAINT court_working_hours_time_order CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_court_working_hours_court ON public.court_working_hours(court_id);

COMMENT ON TABLE public.court_working_hours IS
  'Janela de funcionamento por dia da semana (0=domingo … 6=sábado, igual a Date.getDay()).';

CREATE OR REPLACE FUNCTION public.set_court_working_hours_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_working_hours_updated_at ON public.court_working_hours;
CREATE TRIGGER trg_court_working_hours_updated_at
  BEFORE UPDATE ON public.court_working_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.set_court_working_hours_updated_at();

ALTER TABLE public.court_working_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_view_court_working_hours" ON public.court_working_hours;
DROP POLICY IF EXISTS "authenticated_users_can_insert_court_working_hours" ON public.court_working_hours;
DROP POLICY IF EXISTS "authenticated_users_can_update_court_working_hours" ON public.court_working_hours;
DROP POLICY IF EXISTS "authenticated_users_can_delete_court_working_hours" ON public.court_working_hours;

CREATE POLICY "authenticated_users_can_view_court_working_hours"
ON public.court_working_hours FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_working_hours.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE POLICY "authenticated_users_can_insert_court_working_hours"
ON public.court_working_hours FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_working_hours.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE POLICY "authenticated_users_can_update_court_working_hours"
ON public.court_working_hours FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_working_hours.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_working_hours.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);

CREATE POLICY "authenticated_users_can_delete_court_working_hours"
ON public.court_working_hours FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = court_working_hours.court_id
      AND (
        EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = ct.company_id AND uc.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.company_id = ct.company_id AND c.user_id = auth.uid() AND c.is_active = true)
      )
  )
);
