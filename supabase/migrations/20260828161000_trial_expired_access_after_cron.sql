-- Após o cron marcar status=expired, a UI ainda precisa identificar trial_expired.

CREATE OR REPLACE FUNCTION public.get_company_subscription_access(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.company_subscriptions%ROWTYPE;
  v_trial_days int;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('has_access', false, 'access_type', 'none');
  END IF;

  SELECT cs.* INTO v_row
  FROM public.company_subscriptions cs
  WHERE cs.company_id = p_company_id
  ORDER BY cs.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_access', false,
      'access_type', 'none',
      'status', null
    );
  END IF;

  IF v_row.status = 'active'
     AND (v_row.end_date IS NULL OR v_row.end_date::date >= CURRENT_DATE) THEN
    RETURN jsonb_build_object(
      'has_access', true,
      'access_type', 'active',
      'status', v_row.status,
      'plan_id', v_row.plan_id,
      'end_date', v_row.end_date,
      'is_trial', false
    );
  END IF;

  IF v_row.status = 'trial'
     AND v_row.is_trial = true
     AND v_row.trial_ends_at IS NOT NULL
     AND v_row.trial_ends_at > NOW() THEN
    v_trial_days := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (v_row.trial_ends_at - NOW())) / 86400.0)::int
    );
    RETURN jsonb_build_object(
      'has_access', true,
      'access_type', 'trial',
      'status', v_row.status,
      'plan_id', v_row.plan_id,
      'is_trial', true,
      'trial_started_at', v_row.trial_started_at,
      'trial_ends_at', v_row.trial_ends_at,
      'trial_days_remaining', v_trial_days
    );
  END IF;

  IF (v_row.status = 'trial' AND v_row.trial_ends_at IS NOT NULL AND v_row.trial_ends_at <= NOW())
     OR (v_row.status = 'expired' AND v_row.trial_ends_at IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'has_access', false,
      'access_type', 'trial_expired',
      'status', 'trial_expired',
      'plan_id', v_row.plan_id,
      'is_trial', coalesce(v_row.is_trial, false),
      'trial_ends_at', v_row.trial_ends_at
    );
  END IF;

  RETURN jsonb_build_object(
    'has_access', false,
    'access_type', 'none',
    'status', v_row.status,
    'plan_id', v_row.plan_id,
    'is_trial', v_row.is_trial,
    'end_date', v_row.end_date
  );
END;
$$;
