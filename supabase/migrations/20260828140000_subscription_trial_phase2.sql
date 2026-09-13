-- ============================================================================
-- Fase 2 — Trial 15 dias: RPC de ativação + habilitar trial em produção
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_company_trial_subscription(
  p_company_id uuid,
  p_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_trial_days int;
  v_company public.companies%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_sub_id uuid;
  v_now timestamptz := NOW();
  v_ends timestamptz;
  v_start_date date;
  v_end_date date;
BEGIN
  v_settings := public.get_trial_settings();

  IF NOT coalesce((v_settings->>'trial_enabled')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_disabled');
  END IF;

  IF p_company_id IS NULL OR p_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  IF v_company.trial_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_already_used');
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = p_plan_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_plan');
  END IF;

  IF public.company_has_valid_subscription(p_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_subscribed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_subscriptions cs
    WHERE cs.company_id = p_company_id
      AND cs.status IN ('trial', 'pending', 'active')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_exists');
  END IF;

  v_trial_days := greatest(1, coalesce((v_settings->>'trial_days_default')::int, 15));
  v_ends := v_now + make_interval(days => v_trial_days);
  v_start_date := v_now::date;
  v_end_date := v_ends::date;

  INSERT INTO public.company_subscriptions (
    company_id,
    plan_id,
    start_date,
    end_date,
    status,
    is_trial,
    trial_started_at,
    trial_ends_at,
    billing_cycle_start,
    billing_cycle_end
  ) VALUES (
    p_company_id,
    p_plan_id,
    v_start_date,
    v_end_date,
    'trial',
    true,
    v_now,
    v_ends,
    v_start_date,
    v_end_date
  )
  RETURNING id INTO v_sub_id;

  UPDATE public.companies
  SET trial_used_at = v_now
  WHERE id = p_company_id;

  PERFORM public.sync_company_flags_from_plan(p_company_id, p_plan_id);

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'trial_ends_at', v_ends,
    'trial_days', v_trial_days,
    'plan_id', p_plan_id,
    'plan_name', v_plan.name
  );
END;
$$;

COMMENT ON FUNCTION public.start_company_trial_subscription(uuid, uuid) IS
  'Inicia trial gratuito para empresa nova: valida flags, cria assinatura trial e sincroniza plano.';

GRANT EXECUTE ON FUNCTION public.start_company_trial_subscription(uuid, uuid) TO service_role;

-- Habilitar trial para novos cadastros (rollback: UPDATE value = false)
UPDATE public.app_config
SET value = 'true', updated_at = NOW()
WHERE key = 'trial_enabled';
