-- Fase A: base para pacotes mensais de quadra (backoffice only).
-- Mantém comportamento atual inalterado via feature flag default false.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS court_enable_monthly_packages boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.court_enable_monthly_packages IS
  'Habilita criação e gestão de pacotes mensais de quadra no painel interno da arena.';

CREATE OR REPLACE FUNCTION public.company_court_monthly_packages_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies co
    LEFT JOIN public.segment_types st ON st.id = co.segment_type
    WHERE co.id = p_company_id
      AND COALESCE(st.scheduling_mode, 'service') = 'court'
      AND COALESCE(co.court_enable_monthly_packages, false) = true
  );
$$;

COMMENT ON FUNCTION public.company_court_monthly_packages_enabled(uuid) IS
  'Retorna true quando a empresa está em modo arena e habilitou pacotes mensais.';

REVOKE ALL ON FUNCTION public.company_court_monthly_packages_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_court_monthly_packages_enabled(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.court_monthly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN ('discount_percent', 'discount_fixed', 'pay_x_get_y')),
  discount_percent numeric(5,2) NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_fixed_amount numeric(12,2) NULL CHECK (discount_fixed_amount >= 0),
  pay_for_slots integer NULL CHECK (pay_for_slots >= 1),
  bonus_slots integer NULL CHECK (bonus_slots >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT court_monthly_plans_benefit_payload_check CHECK (
    (
      benefit_type = 'discount_percent'
      AND discount_percent IS NOT NULL
      AND discount_fixed_amount IS NULL
      AND pay_for_slots IS NULL
      AND bonus_slots IS NULL
    )
    OR
    (
      benefit_type = 'discount_fixed'
      AND discount_fixed_amount IS NOT NULL
      AND discount_percent IS NULL
      AND pay_for_slots IS NULL
      AND bonus_slots IS NULL
    )
    OR
    (
      benefit_type = 'pay_x_get_y'
      AND pay_for_slots IS NOT NULL
      AND bonus_slots IS NOT NULL
      AND discount_percent IS NULL
      AND discount_fixed_amount IS NULL
    )
  )
);

COMMENT ON TABLE public.court_monthly_plans IS
  'Catálogo de planos mensais da arena (desconto percentual, fixo ou pague X leve Y).';

CREATE INDEX IF NOT EXISTS idx_court_monthly_plans_company_active
  ON public.court_monthly_plans(company_id, is_active, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_court_monthly_plans_company_name_lower
  ON public.court_monthly_plans(company_id, lower(name));

CREATE OR REPLACE FUNCTION public.set_court_monthly_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_monthly_plans_updated_at ON public.court_monthly_plans;
CREATE TRIGGER trg_court_monthly_plans_updated_at
BEFORE UPDATE ON public.court_monthly_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_court_monthly_plans_updated_at();

ALTER TABLE public.court_monthly_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.court_monthly_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NULL REFERENCES public.court_monthly_plans(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
  reference_month date NOT NULL,
  week_day integer NOT NULL CHECK (week_day BETWEEN 0 AND 6),
  start_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 1 AND duration_minutes <= 1440),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  occurrences_count integer NOT NULL CHECK (occurrences_count >= 1),
  charged_occurrences_count integer NOT NULL CHECK (charged_occurrences_count >= 1),
  bonus_occurrences_count integer NOT NULL DEFAULT 0 CHECK (bonus_occurrences_count >= 0),
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('mercado_pago', 'dinheiro')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'refunded')),
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'active', 'cancelled')),
  mp_preference_id text NULL,
  mp_payment_id text NULL,
  mp_payment_status text NULL,
  notes text NULL,
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT court_monthly_packages_reference_month_first_day CHECK (
    reference_month = date_trunc('month', reference_month)::date
  ),
  CONSTRAINT court_monthly_packages_amounts_check CHECK (
    total_amount = subtotal_amount - discount_amount
  ),
  CONSTRAINT court_monthly_packages_occurrences_check CHECK (
    charged_occurrences_count + bonus_occurrences_count = occurrences_count
  )
);

COMMENT ON TABLE public.court_monthly_packages IS
  'Contrato mensal de reserva de quadra, fechado no backoffice entre arena e cliente.';

CREATE INDEX IF NOT EXISTS idx_court_monthly_packages_company_month_status
  ON public.court_monthly_packages(company_id, reference_month, status);

CREATE INDEX IF NOT EXISTS idx_court_monthly_packages_client_month
  ON public.court_monthly_packages(client_id, reference_month DESC);

CREATE INDEX IF NOT EXISTS idx_court_monthly_packages_payment_status
  ON public.court_monthly_packages(company_id, payment_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_court_monthly_packages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_court_monthly_packages_updated_at ON public.court_monthly_packages;
CREATE TRIGGER trg_court_monthly_packages_updated_at
BEFORE UPDATE ON public.court_monthly_packages
FOR EACH ROW
EXECUTE FUNCTION public.set_court_monthly_packages_updated_at();

ALTER TABLE public.court_monthly_packages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.court_monthly_package_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.court_monthly_packages(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  occurrence_index integer NOT NULL CHECK (occurrence_index >= 1),
  is_bonus boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id),
  UNIQUE (package_id, occurrence_index)
);

COMMENT ON TABLE public.court_monthly_package_appointments IS
  'Vínculo entre pacote mensal e cada agendamento gerado para o mês.';

CREATE INDEX IF NOT EXISTS idx_court_monthly_package_appt_package
  ON public.court_monthly_package_appointments(package_id, occurrence_index);

CREATE INDEX IF NOT EXISTS idx_court_monthly_package_appt_occurrence_date
  ON public.court_monthly_package_appointments(occurrence_date);

ALTER TABLE public.court_monthly_package_appointments ENABLE ROW LEVEL SECURITY;
