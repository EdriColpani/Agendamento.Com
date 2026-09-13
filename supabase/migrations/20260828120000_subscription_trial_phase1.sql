-- ============================================================================
-- Fase 1 — Trial 15 dias: schema, configuração e helpers de acesso
-- Não altera fluxo de cadastro ainda (trial_enabled = false por padrão).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Colunas em company_subscriptions
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.company_subscriptions.is_trial IS
  'true enquanto a assinatura estiver no período de teste gratuito.';

COMMENT ON COLUMN public.company_subscriptions.trial_started_at IS
  'Início do trial (timestamptz).';

COMMENT ON COLUMN public.company_subscriptions.trial_ends_at IS
  'Fim do trial; após esta data o acesso trial expira se não houver conversão para plano pago.';

-- Anti-abuso: empresa só pode usar trial uma vez
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_used_at timestamptz;

COMMENT ON COLUMN public.companies.trial_used_at IS
  'Preenchido na primeira ativação de trial; impede novo trial para a mesma empresa.';

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_trial_expiry
  ON public.company_subscriptions (trial_ends_at)
  WHERE is_trial = true AND status = 'trial';

-- ---------------------------------------------------------------------------
-- 2) Configuração global (desligada até Fase 2 go-live)
-- ---------------------------------------------------------------------------

INSERT INTO public.app_config (key, value, description, updated_at)
VALUES
  (
    'trial_enabled',
    'false',
    'Quando true, novos cadastros podem iniciar trial gratuito.',
    NOW()
  ),
  (
    'trial_days_default',
    '15',
    'Duração padrão do trial em dias corridos.',
    NOW()
  )
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3) Settings de trial (leitura pública autenticada)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trial_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'trial_enabled',
    coalesce(
      (
        SELECT lower(btrim(ac.value)) IN ('true', '1', 'yes', 'on')
        FROM public.app_config ac
        WHERE ac.key = 'trial_enabled'
        LIMIT 1
      ),
      false
    ),
    'trial_days_default',
    coalesce(
      (
        SELECT greatest(1, least(90, ac.value::integer))
        FROM public.app_config ac
        WHERE ac.key = 'trial_days_default'
          AND ac.value ~ '^[0-9]+$'
        LIMIT 1
      ),
      15
    )
  );
$$;

COMMENT ON FUNCTION public.get_trial_settings() IS
  'Retorna trial_enabled e trial_days_default a partir de app_config.';

-- ---------------------------------------------------------------------------
-- 4) Assinatura válida = active em vigor OU trial ativo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.company_has_valid_subscription(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT true
    FROM public.company_subscriptions cs
    WHERE cs.company_id = p_company_id
      AND (
        (
          cs.status = 'active'
          AND (cs.end_date IS NULL OR cs.end_date::date >= CURRENT_DATE)
        )
        OR (
          cs.status = 'trial'
          AND cs.is_trial = true
          AND cs.trial_ends_at IS NOT NULL
          AND cs.trial_ends_at > NOW()
        )
      )
    ORDER BY
      CASE WHEN cs.status = 'active' THEN 0 ELSE 1 END,
      cs.created_at DESC
    LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION public.company_has_valid_subscription(uuid) IS
  'true se a empresa possui assinatura active em vigor ou trial ativo (trial_ends_at > now).';

-- ---------------------------------------------------------------------------
-- 5) Detalhes de acesso (UI / Fase 3)
-- ---------------------------------------------------------------------------

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
  v_days_remaining int;
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

  IF v_row.status = 'trial'
     AND v_row.is_trial = true
     AND v_row.trial_ends_at IS NOT NULL
     AND v_row.trial_ends_at <= NOW() THEN
    RETURN jsonb_build_object(
      'has_access', false,
      'access_type', 'trial_expired',
      'status', 'trial_expired',
      'plan_id', v_row.plan_id,
      'is_trial', true,
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

COMMENT ON FUNCTION public.get_company_subscription_access(uuid) IS
  'Resumo de acesso da empresa: active, trial, trial_expired ou none.';

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_trial_settings() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_company_subscription_access(uuid) TO authenticated, service_role;
