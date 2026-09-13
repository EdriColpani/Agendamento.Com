-- ============================================================================
-- Fase 8 — Métricas e validação do trial (dashboard admin global)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_trial_metrics_report(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_since timestamptz;
  v_trials_started integer;
  v_trials_active integer;
  v_trials_expired_in_period integer;
  v_conversions integer;
  v_whatsapp_total integer;
  v_whatsapp_connected integer;
  v_churn_after_conversion integer;
  v_conversion_rate numeric;
  v_whatsapp_rate numeric;
BEGIN
  IF NOT public.auth_is_global_admin() THEN
    RAISE EXCEPTION 'get_trial_metrics_report: acesso negado'
      USING ERRCODE = '42501';
  END IF;

  v_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_since := now() - make_interval(days => v_days);

  SELECT count(*)::int
  INTO v_trials_started
  FROM public.company_subscriptions cs
  WHERE cs.trial_started_at IS NOT NULL
    AND cs.trial_started_at >= v_since;

  SELECT count(*)::int
  INTO v_trials_active
  FROM public.company_subscriptions cs
  WHERE cs.status = 'trial'
    AND cs.is_trial = true
    AND cs.trial_ends_at IS NOT NULL
    AND cs.trial_ends_at > now();

  SELECT count(*)::int
  INTO v_trials_expired_in_period
  FROM public.company_subscriptions cs
  WHERE cs.trial_started_at IS NOT NULL
    AND cs.status = 'expired'
    AND cs.trial_ends_at IS NOT NULL
    AND cs.trial_ends_at >= v_since;

  SELECT count(DISTINCT tcl.subscription_id)::int
  INTO v_conversions
  FROM public.trial_conversion_log tcl
  WHERE tcl.converted_at >= v_since;

  SELECT
    count(DISTINCT cs.company_id)::int,
    count(DISTINCT cs.company_id) FILTER (WHERE wi.status = 'CONNECTED')::int
  INTO v_whatsapp_total, v_whatsapp_connected
  FROM public.company_subscriptions cs
  LEFT JOIN public.whatsapp_instances wi ON wi.company_id = cs.company_id
  WHERE cs.trial_started_at IS NOT NULL
    AND cs.trial_started_at >= v_since;

  SELECT count(DISTINCT tcl.subscription_id)::int
  INTO v_churn_after_conversion
  FROM public.trial_conversion_log tcl
  JOIN public.company_subscriptions cs ON cs.id = tcl.subscription_id
  WHERE tcl.converted_at <= now() - interval '30 days'
    AND tcl.converted_at >= v_since - interval '365 days'
    AND (
      cs.status NOT IN ('active', 'trial', 'pending')
      OR (cs.end_date IS NOT NULL AND cs.end_date < current_date)
    );

  v_conversion_rate := CASE
    WHEN v_trials_started > 0 THEN round((v_conversions::numeric / v_trials_started::numeric) * 100, 1)
    ELSE 0
  END;

  v_whatsapp_rate := CASE
    WHEN v_whatsapp_total > 0 THEN round((v_whatsapp_connected::numeric / v_whatsapp_total::numeric) * 100, 1)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'period_days', v_days,
    'generated_at', now(),
    'trial_settings', public.get_trial_settings(),
    'summary', jsonb_build_object(
      'trials_started', v_trials_started,
      'trials_active', v_trials_active,
      'trials_expired_in_period', v_trials_expired_in_period,
      'conversions', v_conversions,
      'conversion_rate_pct', v_conversion_rate,
      'whatsapp_connected', v_whatsapp_connected,
      'whatsapp_eligible', v_whatsapp_total,
      'whatsapp_connected_pct', v_whatsapp_rate,
      'churn_after_first_month', v_churn_after_conversion,
      'targets', jsonb_build_object(
        'conversion_rate_pct', 15,
        'whatsapp_connected_pct', 50
      )
    ),
    'status_breakdown', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object('status', s.status, 'count', s.cnt)
          ORDER BY s.cnt DESC
        )
        FROM (
          SELECT cs.status, count(*)::int AS cnt
          FROM public.company_subscriptions cs
          WHERE cs.trial_started_at IS NOT NULL
          GROUP BY cs.status
        ) s
      ),
      '[]'::jsonb
    ),
    'funnel_emails', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object('days_since_start', f.days_since_start, 'sent', f.sent)
          ORDER BY f.days_since_start
        )
        FROM (
          SELECT trl.days_since_start, count(*)::int AS sent
          FROM public.trial_reminder_log trl
          WHERE trl.sent_at >= v_since
          GROUP BY trl.days_since_start
        ) f
      ),
      '[]'::jsonb
    ),
    'recent_conversions', coalesce(
      (
        SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.converted_at DESC)
        FROM (
          SELECT
            tcl.id,
            tcl.company_id,
            tcl.subscription_id,
            tcl.converted_at,
            tcl.source,
            c.name AS company_name,
            sp.name AS plan_name
          FROM public.trial_conversion_log tcl
          JOIN public.companies c ON c.id = tcl.company_id
          LEFT JOIN public.subscription_plans sp ON sp.id = tcl.plan_id
          WHERE tcl.converted_at >= v_since
          ORDER BY tcl.converted_at DESC
          LIMIT 25
        ) x
      ),
      '[]'::jsonb
    ),
    'expired_without_conversion', coalesce(
      (
        SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.trial_ends_at DESC)
        FROM (
          SELECT
            cs.id AS subscription_id,
            cs.company_id,
            c.name AS company_name,
            cs.trial_started_at,
            cs.trial_ends_at,
            sp.name AS plan_name
          FROM public.company_subscriptions cs
          JOIN public.companies c ON c.id = cs.company_id
          LEFT JOIN public.subscription_plans sp ON sp.id = cs.plan_id
          WHERE cs.trial_started_at IS NOT NULL
            AND cs.status = 'expired'
            AND cs.trial_ends_at IS NOT NULL
            AND cs.trial_ends_at >= v_since
            AND NOT EXISTS (
              SELECT 1
              FROM public.trial_conversion_log tcl
              WHERE tcl.subscription_id = cs.id
            )
          ORDER BY cs.trial_ends_at DESC
          LIMIT 25
        ) x
      ),
      '[]'::jsonb
    ),
    'scheduler_health', jsonb_build_object(
      'expiration_runs', coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'status', r.status,
              'started_at', r.started_at,
              'finished_at', r.finished_at,
              'expired_count', r.expired_count
            )
            ORDER BY r.started_at DESC
          )
          FROM (
            SELECT id, status, started_at, finished_at, expired_count
            FROM public.trial_expiration_scheduler_runs
            ORDER BY started_at DESC
            LIMIT 5
          ) r
        ),
        '[]'::jsonb
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_trial_metrics_report(integer) IS
  'Relatório agregado de métricas trial para administrador global (Fase 8).';

REVOKE ALL ON FUNCTION public.get_trial_metrics_report(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trial_metrics_report(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_metrics_report(integer) TO service_role;
