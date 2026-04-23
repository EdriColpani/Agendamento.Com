-- ============================================================================
-- Suporte a troca de plano (upgrade/downgrade) com auditoria e vigência.
-- ============================================================================

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle_start date,
  ADD COLUMN IF NOT EXISTS billing_cycle_end date,
  ADD COLUMN IF NOT EXISTS next_plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS pending_change_type text CHECK (pending_change_type IN ('upgrade', 'downgrade'));

UPDATE public.company_subscriptions
SET
  billing_cycle_start = COALESCE(billing_cycle_start, start_date),
  billing_cycle_end = COALESCE(billing_cycle_end, end_date)
WHERE billing_cycle_start IS NULL OR billing_cycle_end IS NULL;

CREATE TABLE IF NOT EXISTS public.subscription_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.company_subscriptions(id) ON DELETE CASCADE,
  from_plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  to_plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  change_type text NOT NULL CHECK (change_type IN ('upgrade', 'downgrade')),
  status text NOT NULL CHECK (status IN ('pending_payment', 'scheduled', 'applied', 'failed', 'cancelled')),
  billing_period text NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  proration_amount numeric(10,2) NOT NULL DEFAULT 0,
  effective_at timestamptz NOT NULL,
  payment_attempt_id uuid NULL REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  payment_gateway_reference text NULL,
  requested_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz NULL,
  failure_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_company_created
  ON public.subscription_change_requests(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_subscription_status
  ON public.subscription_change_requests(subscription_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_payment_attempt
  ON public.subscription_change_requests(payment_attempt_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_change_requests_pending_payment_per_subscription
  ON public.subscription_change_requests(subscription_id)
  WHERE status = 'pending_payment';

CREATE OR REPLACE FUNCTION public.set_subscription_change_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_subscription_change_requests_updated_at
ON public.subscription_change_requests;

CREATE TRIGGER trg_set_subscription_change_requests_updated_at
BEFORE UPDATE ON public.subscription_change_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_subscription_change_requests_updated_at();

ALTER TABLE public.subscription_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_select_own_company_subscription_changes"
ON public.subscription_change_requests;
CREATE POLICY "authenticated_can_select_own_company_subscription_changes"
ON public.subscription_change_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = subscription_change_requests.company_id
  )
);

DROP POLICY IF EXISTS "service_role_manage_subscription_change_requests"
ON public.subscription_change_requests;
CREATE POLICY "service_role_manage_subscription_change_requests"
ON public.subscription_change_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

