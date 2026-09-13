-- Auditoria opcional: conversões trial → assinatura paga (Fase 5).

CREATE TABLE IF NOT EXISTS public.trial_conversion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  plan_id uuid NULL,
  converted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'mercadopago_webhook',
  payment_attempt_id uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_trial_conversion_log_company
  ON public.trial_conversion_log (company_id, converted_at DESC);

COMMENT ON TABLE public.trial_conversion_log IS
  'Registro de conversão de trial para assinatura paga.';

ALTER TABLE public.trial_conversion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_trial_conversion_log" ON public.trial_conversion_log;
CREATE POLICY "service_role_manage_trial_conversion_log"
  ON public.trial_conversion_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_trial_conversion(
  p_company_id uuid,
  p_subscription_id uuid,
  p_plan_id uuid,
  p_source text DEFAULT 'mercadopago_webhook',
  p_payment_attempt_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS NULL OR p_subscription_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.trial_conversion_log (
    company_id,
    subscription_id,
    plan_id,
    source,
    payment_attempt_id
  ) VALUES (
    p_company_id,
    p_subscription_id,
    p_plan_id,
    coalesce(nullif(trim(p_source), ''), 'mercadopago_webhook'),
    p_payment_attempt_id
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_trial_conversion(uuid, uuid, uuid, text, uuid) TO service_role;
