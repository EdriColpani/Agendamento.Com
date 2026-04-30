-- ============================================================================
-- Comissão de vendedores externos (PlanoAgenda / assinatura).
-- Domínio separado de public.commission_payments e colaboradores por serviço.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Representantes (vendedores externos da plataforma)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_sales_representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL,
  display_name text NOT NULL,
  email text,
  commission_percent numeric(7, 4) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_sales_representatives_referral_code_format
    CHECK (length(trim(referral_code)) >= 2 AND length(referral_code) <= 64),
  CONSTRAINT external_sales_representatives_referral_code_lower
    CHECK (referral_code = lower(referral_code)),
  CONSTRAINT external_sales_representatives_commission_range
    CHECK (commission_percent >= 0 AND commission_percent <= 100),
  CONSTRAINT external_sales_representatives_referral_code_unique UNIQUE (referral_code)
);

COMMENT ON TABLE public.external_sales_representatives IS
  'Vendedores externos da plataforma (comissão sobre assinatura); não confundir com comissão de colaborador por serviço.';

CREATE INDEX IF NOT EXISTS idx_external_sales_representatives_active
  ON public.external_sales_representatives (is_active)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 2) Atribuição empresa ↔ vendedor (uma empresa, no máximo um vínculo vigente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_external_sales_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  representative_id uuid NOT NULL REFERENCES public.external_sales_representatives (id) ON DELETE RESTRICT,
  referral_code_used text NOT NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_external_sales_attributions_company_unique UNIQUE (company_id),
  CONSTRAINT company_external_sales_attributions_code_snapshot_chk
    CHECK (length(trim(referral_code_used)) >= 1)
);

COMMENT ON TABLE public.company_external_sales_attributions IS
  'Empresa atribuída a um vendedor externo (ex.: cadastro via link/código).';

CREATE INDEX IF NOT EXISTS idx_company_external_sales_attributions_rep
  ON public.company_external_sales_attributions (representative_id);

-- ---------------------------------------------------------------------------
-- 3) Ledger de comissão (acréscimos, estornos e ajustes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_sales_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id uuid NOT NULL REFERENCES public.external_sales_representatives (id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  ledger_kind text NOT NULL,
  source_kind text NOT NULL,
  mercadopago_payment_id text NOT NULL,
  idempotency_key text NOT NULL,
  payment_attempt_id uuid NULL REFERENCES public.payment_attempts (id) ON DELETE SET NULL,
  subscription_change_request_id uuid NULL REFERENCES public.subscription_change_requests (id) ON DELETE SET NULL,
  base_amount numeric(14, 4) NOT NULL,
  commission_percent_applied numeric(7, 4) NOT NULL,
  commission_amount numeric(14, 4) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_sales_commission_ledger_kind_chk
    CHECK (ledger_kind = ANY (ARRAY['accrual'::text, 'reversal'::text, 'adjustment'::text])),
  CONSTRAINT external_sales_commission_source_chk
    CHECK (source_kind = ANY (ARRAY[
      'subscription_payment'::text,
      'plan_upgrade'::text,
      'refund_or_chargeback'::text,
      'manual'::text
    ])),
  CONSTRAINT external_sales_commission_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT external_sales_commission_mp_id_nonempty
    CHECK (length(trim(mercadopago_payment_id)) >= 1)
);

COMMENT ON TABLE public.external_sales_commission_ledger IS
  'Lançamentos de comissão para vendedores externos (assinatura). Idempotência por idempotency_key.';

CREATE INDEX IF NOT EXISTS idx_external_sales_commission_ledger_rep_created
  ON public.external_sales_commission_ledger (representative_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_sales_commission_ledger_company
  ON public.external_sales_commission_ledger (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_sales_commission_ledger_mp_payment
  ON public.external_sales_commission_ledger (mercadopago_payment_id);

-- ---------------------------------------------------------------------------
-- 4) Pagamentos da plataforma ao vendedor externo (liquidação administrativa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_sales_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id uuid NOT NULL REFERENCES public.external_sales_representatives (id) ON DELETE RESTRICT,
  amount_paid numeric(14, 4) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL,
  reference_note text,
  recorded_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_sales_payouts_amount_positive CHECK (amount_paid > 0),
  CONSTRAINT external_sales_payouts_method_chk
    CHECK (payment_method = ANY (ARRAY['pix'::text, 'transferencia'::text, 'dinheiro'::text, 'outro'::text]))
);

COMMENT ON TABLE public.external_sales_payouts IS
  'Pagamentos efetuados pela plataforma ao vendedor externo; independente de commission_payments (colaborador).';

CREATE INDEX IF NOT EXISTS idx_external_sales_payouts_rep
  ON public.external_sales_payouts (representative_id, paid_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_external_sales_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_sales_representatives_updated_at ON public.external_sales_representatives;
CREATE TRIGGER trg_external_sales_representatives_updated_at
  BEFORE UPDATE ON public.external_sales_representatives
  FOR EACH ROW
  EXECUTE FUNCTION public.set_external_sales_updated_at();

DROP TRIGGER IF EXISTS trg_external_sales_payouts_updated_at ON public.external_sales_payouts;
CREATE TRIGGER trg_external_sales_payouts_updated_at
  BEFORE UPDATE ON public.external_sales_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_external_sales_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: somente service_role (Edge) e administrador global
-- ---------------------------------------------------------------------------
ALTER TABLE public.external_sales_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_external_sales_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_sales_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_sales_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_external_sales_representatives" ON public.external_sales_representatives;
CREATE POLICY "service_role_all_external_sales_representatives"
  ON public.external_sales_representatives
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "global_admin_select_external_sales_representatives" ON public.external_sales_representatives;
CREATE POLICY "global_admin_select_external_sales_representatives"
  ON public.external_sales_representatives
  FOR SELECT
  TO authenticated
  USING (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_modify_external_sales_representatives" ON public.external_sales_representatives;
CREATE POLICY "global_admin_modify_external_sales_representatives"
  ON public.external_sales_representatives
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_update_external_sales_representatives" ON public.external_sales_representatives;
CREATE POLICY "global_admin_update_external_sales_representatives"
  ON public.external_sales_representatives
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_global_admin())
  WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_delete_external_sales_representatives" ON public.external_sales_representatives;
CREATE POLICY "global_admin_delete_external_sales_representatives"
  ON public.external_sales_representatives
  FOR DELETE
  TO authenticated
  USING (public.auth_is_global_admin());

DROP POLICY IF EXISTS "service_role_all_company_external_sales_attributions" ON public.company_external_sales_attributions;
CREATE POLICY "service_role_all_company_external_sales_attributions"
  ON public.company_external_sales_attributions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "global_admin_select_company_external_sales_attributions" ON public.company_external_sales_attributions;
CREATE POLICY "global_admin_select_company_external_sales_attributions"
  ON public.company_external_sales_attributions
  FOR SELECT
  TO authenticated
  USING (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_modify_company_external_sales_attributions" ON public.company_external_sales_attributions;
CREATE POLICY "global_admin_modify_company_external_sales_attributions"
  ON public.company_external_sales_attributions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_update_company_external_sales_attributions" ON public.company_external_sales_attributions;
CREATE POLICY "global_admin_update_company_external_sales_attributions"
  ON public.company_external_sales_attributions
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_global_admin())
  WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_delete_company_external_sales_attributions" ON public.company_external_sales_attributions;
CREATE POLICY "global_admin_delete_company_external_sales_attributions"
  ON public.company_external_sales_attributions
  FOR DELETE
  TO authenticated
  USING (public.auth_is_global_admin());

DROP POLICY IF EXISTS "service_role_all_external_sales_commission_ledger" ON public.external_sales_commission_ledger;
CREATE POLICY "service_role_all_external_sales_commission_ledger"
  ON public.external_sales_commission_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "global_admin_select_external_sales_commission_ledger" ON public.external_sales_commission_ledger;
CREATE POLICY "global_admin_select_external_sales_commission_ledger"
  ON public.external_sales_commission_ledger
  FOR SELECT
  TO authenticated
  USING (public.auth_is_global_admin());

DROP POLICY IF EXISTS "service_role_all_external_sales_payouts" ON public.external_sales_payouts;
CREATE POLICY "service_role_all_external_sales_payouts"
  ON public.external_sales_payouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "global_admin_select_external_sales_payouts" ON public.external_sales_payouts;
CREATE POLICY "global_admin_select_external_sales_payouts"
  ON public.external_sales_payouts
  FOR SELECT
  TO authenticated
  USING (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_modify_external_sales_payouts" ON public.external_sales_payouts;
CREATE POLICY "global_admin_modify_external_sales_payouts"
  ON public.external_sales_payouts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_update_external_sales_payouts" ON public.external_sales_payouts;
CREATE POLICY "global_admin_update_external_sales_payouts"
  ON public.external_sales_payouts
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_global_admin())
  WITH CHECK (public.auth_is_global_admin());

DROP POLICY IF EXISTS "global_admin_delete_external_sales_payouts" ON public.external_sales_payouts;
CREATE POLICY "global_admin_delete_external_sales_payouts"
  ON public.external_sales_payouts
  FOR DELETE
  TO authenticated
  USING (public.auth_is_global_admin());

-- ---------------------------------------------------------------------------
-- RPC: registro de acréscimo (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.external_sales_record_accrual(
  p_company_id uuid,
  p_mercadopago_payment_id text,
  p_base_amount numeric,
  p_source_kind text,
  p_payment_attempt_id uuid DEFAULT NULL,
  p_subscription_change_request_id uuid DEFAULT NULL,
  p_observations text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
  v_rep_id uuid;
  v_pct numeric(7, 4);
  v_commission numeric(14, 4);
  v_base numeric(14, 4);
BEGIN
  IF NOT public.jwt_context_is_service_role() THEN
    RAISE EXCEPTION 'external_sales_record_accrual: apenas service_role'
      USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NULL OR p_mercadopago_payment_id IS NULL OR btrim(p_mercadopago_payment_id) = '' THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'invalid_input');
  END IF;

  IF p_source_kind IS NULL OR p_source_kind NOT IN ('subscription_payment', 'plan_upgrade') THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'invalid_source_kind');
  END IF;

  v_base := round(coalesce(p_base_amount, 0)::numeric, 4);
  IF v_base <= 0 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'non_positive_base');
  END IF;

  IF p_source_kind = 'plan_upgrade' THEN
    IF p_subscription_change_request_id IS NULL THEN
      RETURN jsonb_build_object('recorded', false, 'reason', 'upgrade_requires_change_request');
    END IF;
    v_key := 'accrual:upgrade:' || p_subscription_change_request_id::text || ':' || btrim(p_mercadopago_payment_id);
  ELSE
    IF p_subscription_change_request_id IS NOT NULL THEN
      RETURN jsonb_build_object('recorded', false, 'reason', 'subscription_change_request_not_expected');
    END IF;
    v_key := 'accrual:sub:' || btrim(p_mercadopago_payment_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.external_sales_commission_ledger WHERE idempotency_key = v_key) THEN
    RETURN jsonb_build_object('recorded', true, 'reason', 'already_recorded', 'idempotency_key', v_key);
  END IF;

  SELECT a.representative_id, r.commission_percent
    INTO v_rep_id, v_pct
  FROM public.company_external_sales_attributions a
  INNER JOIN public.external_sales_representatives r ON r.id = a.representative_id
  WHERE a.company_id = p_company_id
    AND r.is_active = true
  LIMIT 1;

  IF v_rep_id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'no_active_attribution');
  END IF;

  v_commission := round(v_base * (v_pct / 100.0), 4);
  IF v_commission = 0 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'zero_commission', 'commission_percent', v_pct);
  END IF;

  INSERT INTO public.external_sales_commission_ledger (
    representative_id,
    company_id,
    ledger_kind,
    source_kind,
    mercadopago_payment_id,
    idempotency_key,
    payment_attempt_id,
    subscription_change_request_id,
    base_amount,
    commission_percent_applied,
    commission_amount,
    observations
  ) VALUES (
    v_rep_id,
    p_company_id,
    'accrual',
    p_source_kind,
    btrim(p_mercadopago_payment_id),
    v_key,
    p_payment_attempt_id,
    p_subscription_change_request_id,
    v_base,
    v_pct,
    v_commission,
    p_observations
  );

  RETURN jsonb_build_object(
    'recorded', true,
    'reason', 'inserted',
    'idempotency_key', v_key,
    'commission_amount', v_commission,
    'representative_id', v_rep_id
  );
END;
$$;

COMMENT ON FUNCTION public.external_sales_record_accrual IS
  'Registra comissão de vendedor externo após pagamento aprovado (Edge / service_role). Idempotente.';

-- ---------------------------------------------------------------------------
-- RPC: estorno (valor espelhado do acréscimo original do mesmo pagamento MP)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.external_sales_record_reversal_for_payment(
  p_original_mercadopago_payment_id text,
  p_observations text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
  v_orig public.external_sales_commission_ledger%ROWTYPE;
  v_rev_amount numeric(14, 4);
BEGIN
  IF NOT public.jwt_context_is_service_role() THEN
    RAISE EXCEPTION 'external_sales_record_reversal_for_payment: apenas service_role'
      USING ERRCODE = '42501';
  END IF;

  IF p_original_mercadopago_payment_id IS NULL OR btrim(p_original_mercadopago_payment_id) = '' THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'invalid_payment_id');
  END IF;

  v_key := 'reversal:sub:' || btrim(p_original_mercadopago_payment_id);

  IF EXISTS (SELECT 1 FROM public.external_sales_commission_ledger WHERE idempotency_key = v_key) THEN
    RETURN jsonb_build_object('recorded', true, 'reason', 'already_recorded', 'idempotency_key', v_key);
  END IF;

  SELECT *
    INTO v_orig
  FROM public.external_sales_commission_ledger
  WHERE mercadopago_payment_id = btrim(p_original_mercadopago_payment_id)
    AND ledger_kind = 'accrual'
    AND source_kind IN ('subscription_payment', 'plan_upgrade')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_orig.id IS NULL THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'no_accrual_for_payment');
  END IF;

  v_rev_amount := round(-1.0 * abs(v_orig.commission_amount), 4);

  INSERT INTO public.external_sales_commission_ledger (
    representative_id,
    company_id,
    ledger_kind,
    source_kind,
    mercadopago_payment_id,
    idempotency_key,
    payment_attempt_id,
    subscription_change_request_id,
    base_amount,
    commission_percent_applied,
    commission_amount,
    observations
  ) VALUES (
    v_orig.representative_id,
    v_orig.company_id,
    'reversal',
    'refund_or_chargeback',
    btrim(p_original_mercadopago_payment_id),
    v_key,
    v_orig.payment_attempt_id,
    v_orig.subscription_change_request_id,
    round(-1.0 * abs(v_orig.base_amount), 4),
    v_orig.commission_percent_applied,
    v_rev_amount,
    coalesce(p_observations, 'Estorno ou chargeback do pagamento Mercado Pago.')
  );

  RETURN jsonb_build_object(
    'recorded', true,
    'reason', 'reversal_inserted',
    'commission_amount', v_rev_amount,
    'idempotency_key', v_key
  );
END;
$$;

COMMENT ON FUNCTION public.external_sales_record_reversal_for_payment IS
  'Debita comissão previamente creditada para o mesmo mercadopago_payment_id (Edge).';

GRANT EXECUTE ON FUNCTION public.external_sales_record_accrual(
  uuid, text, numeric, text, uuid, uuid, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.external_sales_record_reversal_for_payment(text, text) TO service_role;
