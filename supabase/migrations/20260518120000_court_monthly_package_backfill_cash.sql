-- Regulariza recebimento financeiro de pacotes mensais em dinheiro sem lançamento em cash_movements.

CREATE OR REPLACE FUNCTION public.backfill_court_monthly_package_cash_receipt_internal(
  p_package_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pkg record;
  v_marker text;
  v_receipt_id uuid;
  v_already_exists boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_package_id IS NULL THEN
    RAISE EXCEPTION 'Pacote obrigatório';
  END IF;

  SELECT *
    INTO v_pkg
  FROM public.court_monthly_packages p
  WHERE p.id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado';
  END IF;

  IF NOT public.company_court_monthly_packages_enabled(v_pkg.company_id) THEN
    RAISE EXCEPTION 'Pacotes mensais não habilitados para esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = v_pkg.company_id
      AND uc.user_id = v_actor
      AND rt.description IN ('Proprietário', 'Admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para regularizar recebimento nesta empresa';
  END IF;

  IF v_pkg.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível regularizar recebimento de pacote cancelado';
  END IF;

  IF v_pkg.payment_method <> 'dinheiro' THEN
    RAISE EXCEPTION 'Regularização disponível apenas para pacotes pagos em dinheiro no balcão';
  END IF;

  IF v_pkg.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Pacote precisa estar com pagamento confirmado (pago) para regularizar';
  END IF;

  IF COALESCE(v_pkg.total_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Pacote sem valor a receber';
  END IF;

  v_marker := public.court_monthly_package_cash_marker(p_package_id);

  v_already_exists := EXISTS (
    SELECT 1
    FROM public.cash_movements cm
    WHERE cm.company_id = v_pkg.company_id
      AND cm.transaction_type = 'recebimento'
      AND cm.observations LIKE '%' || v_marker || '%'
  );

  IF v_already_exists THEN
    RETURN jsonb_build_object(
      'ok', true,
      'package_id', p_package_id,
      'created', false,
      'already_exists', true,
      'message', 'Recebimento já registrado no financeiro.'
    );
  END IF;

  v_receipt_id := public.register_court_monthly_package_cash_receipt_internal(
    p_package_id,
    v_pkg.company_id,
    v_pkg.total_amount,
    v_pkg.reference_month,
    v_actor
  );

  IF v_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível criar o recebimento no financeiro';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'package_id', p_package_id,
    'created', true,
    'already_exists', false,
    'cash_receipt_id', v_receipt_id,
    'total_amount', v_pkg.total_amount,
    'message', 'Recebimento registrado no financeiro.'
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_court_monthly_package_cash_receipt_internal(uuid) IS
  'Cria recebimento em cash_movements para pacote mensal em dinheiro já pago sem lançamento prévio.';

REVOKE ALL ON FUNCTION public.backfill_court_monthly_package_cash_receipt_internal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_court_monthly_package_cash_receipt_internal(uuid) TO authenticated;

-- Regulariza todos os pacotes elegíveis da empresa (uso administrativo).
CREATE OR REPLACE FUNCTION public.backfill_court_monthly_packages_cash_for_company_internal(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pkg record;
  v_created integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa obrigatória';
  END IF;

  IF NOT public.company_court_monthly_packages_enabled(p_company_id) THEN
    RAISE EXCEPTION 'Pacotes mensais não habilitados para esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = p_company_id
      AND uc.user_id = v_actor
      AND rt.description IN ('Proprietário', 'Admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para regularizar recebimentos nesta empresa';
  END IF;

  FOR v_pkg IN
    SELECT p.id
    FROM public.court_monthly_packages p
    WHERE p.company_id = p_company_id
      AND p.payment_method = 'dinheiro'
      AND p.payment_status = 'paid'
      AND p.status <> 'cancelled'
      AND COALESCE(p.total_amount, 0) > 0
    ORDER BY p.created_at ASC
  LOOP
    BEGIN
      v_result := public.backfill_court_monthly_package_cash_receipt_internal(v_pkg.id);
      IF COALESCE((v_result->>'created')::boolean, false) THEN
        v_created := v_created + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'created', v_created,
    'skipped_already_exists', v_skipped,
    'failed', v_failed
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_court_monthly_packages_cash_for_company_internal(uuid) IS
  'Regulariza recebimentos em dinheiro de todos os pacotes mensais ativos da empresa sem lançamento prévio.';

REVOKE ALL ON FUNCTION public.backfill_court_monthly_packages_cash_for_company_internal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_court_monthly_packages_cash_for_company_internal(uuid) TO authenticated;
