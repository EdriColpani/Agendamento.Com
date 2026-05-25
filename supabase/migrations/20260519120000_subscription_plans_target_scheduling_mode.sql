-- Público-alvo do plano: serviços (salão/clínica) ou arena (quadras).
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS target_scheduling_mode TEXT NOT NULL DEFAULT 'service';

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_target_scheduling_mode_check;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_target_scheduling_mode_check
  CHECK (target_scheduling_mode IN ('service', 'court'));

COMMENT ON COLUMN public.subscription_plans.target_scheduling_mode IS
  'Público do plano: service = salão/clínica/outros serviços; court = arena/quadras.';

-- Planos cujo nome indica arena passam a ser exclusivos de quadras.
UPDATE public.subscription_plans
SET target_scheduling_mode = 'court'
WHERE target_scheduling_mode = 'service'
  AND (
    lower(name) LIKE '%arena%'
    OR lower(name) LIKE '%quadra%'
  );
