-- Fase 3: cancelamento em lote, complementar meses faltantes e Mercado Pago no período.

-- Cancela todos os pacotes ativos de um lote e os agendamentos vinculados (exceto concluídos).
CREATE OR REPLACE FUNCTION public.cancel_court_monthly_package_batch_internal(
  p_batch_id uuid,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch record;
  v_reason text := NULLIF(trim(COALESCE(p_cancellation_reason, '')), '');
  v_pkg record;
  v_cancelled_packages integer := 0;
  v_cancelled_appointments integer := 0;
  v_appt_count integer := 0;
  v_mp_paid_packages integer := 0;
  v_skipped_packages integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Lote obrigatório';
  END IF;

  SELECT *
    INTO v_batch
  FROM public.court_monthly_package_batches b
  WHERE b.id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado';
  END IF;

  IF NOT public.company_court_monthly_packages_enabled(v_batch.company_id) THEN
    RAISE EXCEPTION 'Pacotes mensais não habilitados para esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = v_batch.company_id
      AND uc.user_id = v_actor
      AND rt.description IN ('Proprietário', 'Admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar pacotes nesta empresa';
  END IF;

  FOR v_pkg IN
    SELECT p.id, p.status, p.payment_method, p.payment_status
    FROM public.court_monthly_packages p
    WHERE p.batch_id = p_batch_id
  LOOP
    IF v_pkg.status = 'cancelled' THEN
      v_skipped_packages := v_skipped_packages + 1;
      CONTINUE;
    END IF;

    IF v_pkg.payment_method = 'mercado_pago'
      AND v_pkg.payment_status = 'paid' THEN
      v_mp_paid_packages := v_mp_paid_packages + 1;
    END IF;

    WITH upd_appt AS (
      UPDATE public.appointments a
      SET
        status = 'cancelado',
        cancelled_at = now(),
        cancelled_by_user_id = v_actor,
        cancellation_reason = COALESCE(v_reason, 'Cancelamento do lote de pacotes mensais.')
      FROM public.court_monthly_package_appointments cma
      WHERE cma.package_id = v_pkg.id
        AND cma.appointment_id = a.id
        AND a.status NOT IN ('concluido', 'cancelado')
      RETURNING a.id
    )
    SELECT count(*)::int INTO v_appt_count FROM upd_appt;

    v_cancelled_appointments := v_cancelled_appointments + v_appt_count;

    UPDATE public.court_monthly_packages
    SET
      status = 'cancelled',
      payment_status = CASE
        WHEN payment_method = 'dinheiro' AND payment_status = 'paid' THEN 'cancelled'
        WHEN payment_method = 'mercado_pago' AND payment_status = 'pending' THEN 'cancelled'
        ELSE payment_status
      END,
      cancelled_at = now(),
      cancelled_by_user_id = v_actor
    WHERE id = v_pkg.id;

    v_cancelled_packages := v_cancelled_packages + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'cancelled_packages', v_cancelled_packages,
    'skipped_already_cancelled', v_skipped_packages,
    'mp_paid_packages_count', v_mp_paid_packages,
    'mp_paid_warning',
      CASE
        WHEN v_mp_paid_packages > 0
        THEN 'Existem pacotes pagos via Mercado Pago. Estorne manualmente se necessário.'
        ELSE NULL
      END
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_court_monthly_package_batch_internal(uuid, text) IS
  'Cancela pacotes e agendamentos de um lote (exceto concluídos).';

REVOKE ALL ON FUNCTION public.cancel_court_monthly_package_batch_internal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_court_monthly_package_batch_internal(uuid, text) TO authenticated;

-- Complementa meses do lote que ainda não possuem pacote ativo.
CREATE OR REPLACE FUNCTION public.complement_court_monthly_package_batch_internal(
  p_batch_id uuid,
  p_client_nickname text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch record;
  v_client_nickname text;
  v_month_offset integer;
  v_reference_month date;
  v_result jsonb;
  v_package_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_skipped_count integer := 0;
  v_failed_count integer := 0;
  v_err text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT *
    INTO v_batch
  FROM public.court_monthly_package_batches b
  WHERE b.id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado';
  END IF;

  IF NOT public.company_court_monthly_packages_enabled(v_batch.company_id) THEN
    RAISE EXCEPTION 'Pacotes mensais não habilitados para esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = v_batch.company_id
      AND uc.user_id = v_actor
      AND rt.description IN ('Proprietário', 'Admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  v_client_nickname := NULLIF(trim(COALESCE(p_client_nickname, '')), '');
  IF v_client_nickname IS NULL THEN
    SELECT c.name INTO v_client_nickname
    FROM public.clients c
    WHERE c.id = v_batch.client_id;
  END IF;

  FOR v_month_offset IN 0..(v_batch.duration_months - 1) LOOP
    v_reference_month := (v_batch.start_month + make_interval(months => v_month_offset))::date;

    IF EXISTS (
      SELECT 1
      FROM public.court_monthly_packages pkg
      WHERE pkg.company_id = v_batch.company_id
        AND pkg.client_id = v_batch.client_id
        AND pkg.court_id = v_batch.court_id
        AND pkg.reference_month = v_reference_month
        AND pkg.week_day = v_batch.week_day
        AND pkg.start_time = v_batch.start_time
        AND pkg.duration_minutes = v_batch.duration_minutes
        AND pkg.status <> 'cancelled'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'reference_month', v_reference_month,
          'status', 'skipped_duplicate',
          'message', 'Pacote já existe neste mês'
        )
      );
      CONTINUE;
    END IF;

    BEGIN
      v_result := public.create_court_monthly_package_internal(
        v_batch.company_id,
        v_batch.client_id,
        v_client_nickname,
        v_batch.court_id,
        v_reference_month,
        v_batch.week_day,
        v_batch.start_time,
        v_batch.duration_minutes,
        v_batch.plan_id,
        v_batch.payment_method,
        v_batch.notes
      );

      v_package_id := (v_result->>'package_id')::uuid;
      IF v_package_id IS NOT NULL THEN
        UPDATE public.court_monthly_packages
        SET batch_id = p_batch_id
        WHERE id = v_package_id;
      END IF;

      v_created_count := v_created_count + 1;
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'reference_month', v_reference_month,
          'status', 'created',
          'package_id', v_result->>'package_id',
          'payment_method', v_result->>'payment_method',
          'payment_status', v_result->>'payment_status',
          'total_amount', v_result->'total_amount'
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
        v_failed_count := v_failed_count + 1;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'reference_month', v_reference_month,
            'status', 'failed',
            'error', v_err
          )
        );
    END;
  END LOOP;

  UPDATE public.court_monthly_package_batches
  SET
    created_count = created_count + v_created_count,
    skipped_count = skipped_count + v_skipped_count,
    failed_count = failed_count + v_failed_count
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'created_count', v_created_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.complement_court_monthly_package_batch_internal(uuid, text) IS
  'Cria pacotes faltantes para os meses do lote original (mesmos parâmetros do batch).';

REVOKE ALL ON FUNCTION public.complement_court_monthly_package_batch_internal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complement_court_monthly_package_batch_internal(uuid, text) TO authenticated;

-- Período: aceita Mercado Pago; retorna lista de checkouts pendentes.
CREATE OR REPLACE FUNCTION public.create_court_monthly_packages_for_period_internal(
  p_company_id uuid,
  p_client_id uuid,
  p_client_nickname text,
  p_court_id uuid,
  p_start_month date,
  p_duration_months integer,
  p_week_day integer,
  p_start_time time,
  p_duration_minutes integer,
  p_plan_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'dinheiro',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_start_month date := date_trunc('month', p_start_month)::date;
  v_current_month date := date_trunc('month', current_date)::date;
  v_payment_method text := NULLIF(trim(COALESCE(p_payment_method, '')), '');
  v_batch_id uuid;
  v_month_offset integer;
  v_reference_month date;
  v_result jsonb;
  v_package_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_pending_checkouts jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_skipped_count integer := 0;
  v_failed_count integer := 0;
  v_err text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_duration_months IS NULL OR p_duration_months NOT IN (1, 3, 6, 9, 12) THEN
    RAISE EXCEPTION 'Duração inválida. Use 1, 3, 6, 9 ou 12 meses.';
  END IF;

  IF p_start_month IS NULL THEN
    RAISE EXCEPTION 'Mês inicial obrigatório';
  END IF;

  IF v_start_month < v_current_month THEN
    RAISE EXCEPTION 'Mês inicial não pode ser anterior ao mês corrente';
  END IF;

  IF v_payment_method IS NULL OR v_payment_method NOT IN ('mercado_pago', 'dinheiro') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  IF v_payment_method = 'mercado_pago' AND NOT EXISTS (
    SELECT 1
    FROM public.company_payment_credentials cpc
    WHERE cpc.company_id = p_company_id
      AND cpc.provider = 'mercadopago'
      AND cpc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Pagamento online Mercado Pago não está configurado para esta empresa.';
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
    RAISE EXCEPTION 'Sem permissão para criar pacote mensal nesta empresa';
  END IF;

  INSERT INTO public.court_monthly_package_batches (
    company_id,
    client_id,
    court_id,
    plan_id,
    start_month,
    duration_months,
    week_day,
    start_time,
    duration_minutes,
    payment_method,
    notes,
    created_by_user_id
  ) VALUES (
    p_company_id,
    p_client_id,
    p_court_id,
    p_plan_id,
    v_start_month,
    p_duration_months,
    p_week_day,
    p_start_time,
    p_duration_minutes,
    v_payment_method,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_actor
  )
  RETURNING id INTO v_batch_id;

  FOR v_month_offset IN 0..(p_duration_months - 1) LOOP
    v_reference_month := (v_start_month + make_interval(months => v_month_offset))::date;

    IF EXISTS (
      SELECT 1
      FROM public.court_monthly_packages pkg
      WHERE pkg.company_id = p_company_id
        AND pkg.client_id = p_client_id
        AND pkg.court_id = p_court_id
        AND pkg.reference_month = v_reference_month
        AND pkg.week_day = p_week_day
        AND pkg.start_time = p_start_time
        AND pkg.duration_minutes = p_duration_minutes
        AND pkg.status <> 'cancelled'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'reference_month', v_reference_month,
          'status', 'skipped_duplicate',
          'message', 'Já existe pacote ativo para este cliente, quadra e horário neste mês'
        )
      );
      CONTINUE;
    END IF;

    BEGIN
      v_result := public.create_court_monthly_package_internal(
        p_company_id,
        p_client_id,
        p_client_nickname,
        p_court_id,
        v_reference_month,
        p_week_day,
        p_start_time,
        p_duration_minutes,
        p_plan_id,
        v_payment_method,
        p_notes
      );

      v_package_id := (v_result->>'package_id')::uuid;
      IF v_package_id IS NOT NULL THEN
        UPDATE public.court_monthly_packages
        SET batch_id = v_batch_id
        WHERE id = v_package_id;

        IF v_payment_method = 'mercado_pago'
          AND (v_result->>'status') = 'pending_payment' THEN
          v_pending_checkouts := v_pending_checkouts || jsonb_build_array(
            jsonb_build_object(
              'package_id', v_package_id,
              'reference_month', v_reference_month,
              'total_amount', v_result->'total_amount'
            )
          );
        END IF;
      END IF;

      v_created_count := v_created_count + 1;
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'reference_month', v_reference_month,
          'status', 'created',
          'package_id', v_result->>'package_id',
          'total_amount', v_result->'total_amount',
          'payment_method', v_result->>'payment_method',
          'payment_status', v_result->>'payment_status'
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
        v_failed_count := v_failed_count + 1;
        v_items := v_items || jsonb_build_array(
          jsonb_build_object(
            'reference_month', v_reference_month,
            'status', 'failed',
            'error', v_err
          )
        );
    END;
  END LOOP;

  UPDATE public.court_monthly_package_batches
  SET
    created_count = v_created_count,
    skipped_count = v_skipped_count,
    failed_count = v_failed_count
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'payment_method', v_payment_method,
    'requested_months', p_duration_months,
    'created_count', v_created_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'pending_checkouts', v_pending_checkouts,
    'items', v_items
  );
END;
$$;

-- Relax batch payment_method constraint to allow mercado_pago
ALTER TABLE public.court_monthly_package_batches
  DROP CONSTRAINT IF EXISTS court_monthly_package_batches_payment_method_check;

ALTER TABLE public.court_monthly_package_batches
  ADD CONSTRAINT court_monthly_package_batches_payment_method_check
  CHECK (payment_method IN ('mercado_pago', 'dinheiro'));
