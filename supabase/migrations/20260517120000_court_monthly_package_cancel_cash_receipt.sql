-- Cancelamento de pacote avulso + recebimento financeiro na criação (dinheiro).

CREATE OR REPLACE FUNCTION public.court_monthly_package_cash_marker(p_package_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '[PACOTE_MENSAL:' || p_package_id::text || ']';
$$;

CREATE OR REPLACE FUNCTION public.register_court_monthly_package_cash_receipt_internal(
  p_package_id uuid,
  p_company_id uuid,
  p_total_amount numeric,
  p_reference_month date,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker text := public.court_monthly_package_cash_marker(p_package_id);
  v_receipt_id uuid;
BEGIN
  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_movements cm
    WHERE cm.company_id = p_company_id
      AND cm.transaction_type = 'recebimento'
      AND cm.observations LIKE '%' || v_marker || '%'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.cash_movements (
    company_id,
    user_id,
    total_amount,
    payment_method,
    transaction_type,
    transaction_date,
    observations
  ) VALUES (
    p_company_id,
    p_actor,
    p_total_amount,
    'dinheiro',
    'recebimento',
    now(),
    'Recebimento do pacote mensal da arena ' || v_marker
      || ' ref. ' || to_char(p_reference_month, 'YYYY-MM') || '.'
  )
  RETURNING id INTO v_receipt_id;

  RETURN v_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_court_monthly_package_cash_receipt_internal(
  p_package_id uuid,
  p_company_id uuid,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker text := public.court_monthly_package_cash_marker(p_package_id);
  v_estorno_marker text := '[ESTORNO_PACOTE_MENSAL:' || p_package_id::text || ']';
  v_receipt record;
  v_reversal_id uuid;
BEGIN
  SELECT cm.id, cm.total_amount
    INTO v_receipt
  FROM public.cash_movements cm
  WHERE cm.company_id = p_company_id
    AND cm.transaction_type = 'recebimento'
    AND cm.observations LIKE '%' || v_marker || '%'
  ORDER BY cm.transaction_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_movements cm
    WHERE cm.company_id = p_company_id
      AND cm.observations LIKE '%' || v_estorno_marker || '%'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.cash_movements (
    company_id,
    user_id,
    total_amount,
    payment_method,
    transaction_type,
    transaction_date,
    observations
  ) VALUES (
    p_company_id,
    p_actor,
    v_receipt.total_amount,
    'dinheiro',
    'despesa',
    now(),
    'Estorno do pacote mensal cancelado ' || v_estorno_marker
      || ' (recebimento ' || v_receipt.id::text || ').'
  )
  RETURNING id INTO v_reversal_id;

  RETURN v_reversal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_court_monthly_package_internal(
  p_package_id uuid,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pkg record;
  v_reason text := NULLIF(trim(COALESCE(p_cancellation_reason, '')), '');
  v_appt_count integer := 0;
  v_cash_reversed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_package_id IS NULL THEN
    RAISE EXCEPTION 'Pacote obrigatório';
  END IF;

  SELECT p.*
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
    RAISE EXCEPTION 'Sem permissão para cancelar pacotes nesta empresa';
  END IF;

  IF v_pkg.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'package_id', p_package_id,
      'already_cancelled', true,
      'cancelled_appointments', 0
    );
  END IF;

  WITH upd_appt AS (
    UPDATE public.appointments a
    SET
      status = 'cancelado',
      cancelled_at = now(),
      cancelled_by_user_id = v_actor,
      cancellation_reason = COALESCE(v_reason, 'Cancelamento do pacote mensal.')
    FROM public.court_monthly_package_appointments cma
    WHERE cma.package_id = p_package_id
      AND cma.appointment_id = a.id
      AND a.status NOT IN ('concluido', 'cancelado')
    RETURNING a.id
  )
  SELECT count(*)::int INTO v_appt_count FROM upd_appt;

  IF v_pkg.payment_method = 'dinheiro' AND v_pkg.payment_status = 'paid' THEN
  PERFORM public.reverse_court_monthly_package_cash_receipt_internal(
    p_package_id,
    v_pkg.company_id,
    v_actor
  );
    v_cash_reversed := true;
  END IF;

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
  WHERE id = p_package_id;

  RETURN jsonb_build_object(
    'ok', true,
    'package_id', p_package_id,
    'cancelled_appointments', v_appt_count,
    'cash_receipt_reversed', v_cash_reversed,
    'mp_paid_warning',
      CASE
        WHEN v_pkg.payment_method = 'mercado_pago' AND v_pkg.payment_status = 'paid'
        THEN 'Pacote pago via Mercado Pago. Estorne manualmente se necessário.'
        ELSE NULL
      END
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_court_monthly_package_internal(uuid, text) IS
  'Cancela um pacote mensal avulso, agendamentos vinculados (exceto concluídos) e estorna recebimento em dinheiro se houver.';

REVOKE ALL ON FUNCTION public.cancel_court_monthly_package_internal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_court_monthly_package_internal(uuid, text) TO authenticated;

-- Recria create com lançamento financeiro para dinheiro.
CREATE OR REPLACE FUNCTION public.create_court_monthly_package_internal(
  p_company_id uuid,
  p_client_id uuid,
  p_client_nickname text,
  p_court_id uuid,
  p_reference_month date,
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
  v_reference_month date := date_trunc('month', p_reference_month)::date;
  v_month_end date := (date_trunc('month', p_reference_month) + interval '1 month - 1 day')::date;
  v_payment_method text := NULLIF(trim(COALESCE(p_payment_method, '')), '');
  v_client_nickname text := NULLIF(trim(COALESCE(p_client_nickname, '')), '');
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_collaborator_id uuid;
  v_service_id uuid;
  v_plan record;
  v_benefit_type text := NULL;
  v_discount_percent numeric(5,2) := NULL;
  v_discount_fixed_amount numeric(12,2) := NULL;
  v_pay_for_slots integer := NULL;
  v_bonus_slots integer := NULL;
  v_package_id uuid;
  v_occurrences_count integer := 0;
  v_bonus_count integer := 0;
  v_charged_count integer := 0;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_slot_price_first numeric(12,2) := 0;
  v_payment_status text := 'pending';
  v_package_status text := 'pending_payment';
  v_appointment_status text := 'pendente';
  v_cash_receipt_id uuid := NULL;
  v_ns int;
  v_ne int;
  v_occ record;
  v_slot_price numeric(12,2);
  v_is_bonus boolean := false;
  v_appointment_id uuid;
  v_effective_notes text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_week_day < 0 OR p_week_day > 6 THEN
    RAISE EXCEPTION 'Dia da semana inválido';
  END IF;

  IF p_reference_month IS NULL THEN
    RAISE EXCEPTION 'Mês de referência obrigatório';
  END IF;

  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'Horário inicial obrigatório';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  IF v_payment_method IS NULL OR v_payment_method NOT IN ('mercado_pago', 'dinheiro') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients cl
    WHERE cl.id = p_client_id
      AND cl.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.courts ct
    WHERE ct.id = p_court_id
      AND ct.company_id = p_company_id
      AND ct.is_active = true
  ) THEN
    RAISE EXCEPTION 'Quadra inválida ou inativa';
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

  IF p_plan_id IS NOT NULL THEN
    SELECT *
      INTO v_plan
    FROM public.court_monthly_plans p
    WHERE p.id = p_plan_id
      AND p.company_id = p_company_id
      AND p.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plano mensal inválido ou inativo';
    END IF;

    v_benefit_type := v_plan.benefit_type;
    v_discount_percent := v_plan.discount_percent;
    v_discount_fixed_amount := v_plan.discount_fixed_amount;
    v_pay_for_slots := v_plan.pay_for_slots;
    v_bonus_slots := v_plan.bonus_slots;
  END IF;

  v_collaborator_id := public.get_or_create_arena_system_collaborator(p_company_id);
  v_service_id := public.get_or_create_arena_system_booking_service(p_company_id);
  v_ns := EXTRACT(HOUR FROM p_start_time)::int * 60 + EXTRACT(MINUTE FROM p_start_time)::int;
  v_ne := v_ns + p_duration_minutes;

  FOR v_occ IN
    SELECT
      gs::date AS occurrence_date,
      row_number() OVER (ORDER BY gs::date)::int AS occurrence_index
    FROM generate_series(v_reference_month, v_month_end, interval '1 day') gs
    WHERE EXTRACT(DOW FROM gs)::int = p_week_day
    ORDER BY gs::date
  LOOP
    v_occurrences_count := v_occurrences_count + 1;

    IF EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.court_id = p_court_id
        AND a.appointment_date = v_occ.occurrence_date
        AND public.is_court_slot_blocking_status(a.status)
        AND (
          (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int) < v_ne
          AND
          (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int
            + COALESCE(a.total_duration_minutes, 60)) > v_ns
        )
    ) THEN
      RAISE EXCEPTION 'Conflito de horário na data % para a quadra selecionada', v_occ.occurrence_date;
    END IF;

    v_slot_price := COALESCE(
      public.compute_court_booking_total_price(
        p_court_id,
        v_occ.occurrence_date,
        p_start_time,
        p_duration_minutes
      ),
      0
    );

    IF v_occurrences_count = 1 THEN
      v_slot_price_first := v_slot_price;
    END IF;

    v_subtotal := v_subtotal + v_slot_price;
  END LOOP;

  IF v_occurrences_count < 1 THEN
    RAISE EXCEPTION 'Nenhuma ocorrência encontrada para os parâmetros informados';
  END IF;

  IF p_plan_id IS NULL THEN
    v_discount := 0;
    v_bonus_count := 0;
    v_charged_count := v_occurrences_count;
  ELSIF v_benefit_type = 'discount_percent' THEN
    v_discount := round(v_subtotal * (v_discount_percent / 100.0), 2);
    v_bonus_count := 0;
    v_charged_count := v_occurrences_count;
  ELSIF v_benefit_type = 'discount_fixed' THEN
    v_discount := LEAST(v_subtotal, v_discount_fixed_amount);
    v_bonus_count := 0;
    v_charged_count := v_occurrences_count;
  ELSE
    v_bonus_count := (
      SELECT count(*)
      FROM (
        SELECT row_number() OVER (ORDER BY gs::date)::int AS idx
        FROM generate_series(v_reference_month, v_month_end, interval '1 day') gs
        WHERE EXTRACT(DOW FROM gs)::int = p_week_day
      ) q
      WHERE ((q.idx - 1) % (v_pay_for_slots + v_bonus_slots)) >= v_pay_for_slots
    );
    v_charged_count := v_occurrences_count - v_bonus_count;

    v_discount := COALESCE((
      SELECT sum(slot_price)::numeric(12,2)
      FROM (
        SELECT
          public.compute_court_booking_total_price(
            p_court_id,
            gs::date,
            p_start_time,
            p_duration_minutes
          )::numeric(12,2) AS slot_price,
          row_number() OVER (ORDER BY gs::date)::int AS idx
        FROM generate_series(v_reference_month, v_month_end, interval '1 day') gs
        WHERE EXTRACT(DOW FROM gs)::int = p_week_day
      ) q
      WHERE ((q.idx - 1) % (v_pay_for_slots + v_bonus_slots)) >= v_pay_for_slots
    ), 0);
  END IF;

  v_discount := GREATEST(0, LEAST(v_subtotal, v_discount));
  v_total := v_subtotal - v_discount;

  IF v_payment_method = 'dinheiro' THEN
    v_payment_status := 'paid';
    v_package_status := 'active';
    v_appointment_status := 'confirmado';
  END IF;

  INSERT INTO public.court_monthly_packages (
    company_id,
    plan_id,
    client_id,
    court_id,
    reference_month,
    week_day,
    start_time,
    duration_minutes,
    unit_price,
    occurrences_count,
    charged_occurrences_count,
    bonus_occurrences_count,
    subtotal_amount,
    discount_amount,
    total_amount,
    payment_method,
    payment_status,
    status,
    notes,
    created_by_user_id
  ) VALUES (
    p_company_id,
    p_plan_id,
    p_client_id,
    p_court_id,
    v_reference_month,
    p_week_day,
    p_start_time,
    p_duration_minutes,
    COALESCE(v_slot_price_first, 0),
    v_occurrences_count,
    v_charged_count,
    v_bonus_count,
    v_subtotal,
    v_discount,
    v_total,
    v_payment_method,
    v_payment_status,
    v_package_status,
    v_notes,
    v_actor
  )
  RETURNING id INTO v_package_id;

  FOR v_occ IN
    SELECT
      gs::date AS occurrence_date,
      row_number() OVER (ORDER BY gs::date)::int AS occurrence_index
    FROM generate_series(v_reference_month, v_month_end, interval '1 day') gs
    WHERE EXTRACT(DOW FROM gs)::int = p_week_day
    ORDER BY gs::date
  LOOP
    v_slot_price := COALESCE(
      public.compute_court_booking_total_price(
        p_court_id,
        v_occ.occurrence_date,
        p_start_time,
        p_duration_minutes
      ),
      0
    );

    v_is_bonus := (
      p_plan_id IS NOT NULL
      AND v_benefit_type = 'pay_x_get_y'
      AND ((v_occ.occurrence_index - 1) % (v_pay_for_slots + v_bonus_slots)) >= v_pay_for_slots
    );

    v_effective_notes := COALESCE(v_notes, '');
    IF v_effective_notes <> '' THEN
      v_effective_notes := v_effective_notes || E'\n';
    END IF;
    v_effective_notes := v_effective_notes || '[PACOTE_MENSAL:' || v_package_id || ']';
    IF v_is_bonus THEN
      v_effective_notes := v_effective_notes || ' [BONUS]';
    END IF;

    INSERT INTO public.appointments (
      company_id,
      client_id,
      client_nickname,
      collaborator_id,
      appointment_date,
      appointment_time,
      total_duration_minutes,
      total_price,
      payment_method,
      observations,
      created_by_user_id,
      status,
      booking_kind,
      court_id
    ) VALUES (
      p_company_id,
      p_client_id,
      v_client_nickname,
      v_collaborator_id,
      v_occ.occurrence_date,
      p_start_time,
      p_duration_minutes,
      CASE WHEN v_is_bonus THEN 0 ELSE v_slot_price END,
      v_payment_method,
      v_effective_notes,
      v_actor,
      v_appointment_status,
      'court',
      p_court_id
    )
    RETURNING id INTO v_appointment_id;

    INSERT INTO public.appointment_services (appointment_id, service_id)
    VALUES (v_appointment_id, v_service_id);

    INSERT INTO public.court_monthly_package_appointments (
      package_id,
      appointment_id,
      occurrence_date,
      occurrence_index,
      is_bonus
    ) VALUES (
      v_package_id,
      v_appointment_id,
      v_occ.occurrence_date,
      v_occ.occurrence_index,
      v_is_bonus
    );
  END LOOP;

  INSERT INTO public.collaborator_services (
    company_id,
    collaborator_id,
    service_id,
    commission_type,
    commission_value,
    active
  ) VALUES (
    p_company_id,
    v_collaborator_id,
    v_service_id,
    'PERCENT',
    0::numeric(10, 2),
    true
  )
  ON CONFLICT (collaborator_id, service_id) DO NOTHING;

  IF v_payment_method = 'dinheiro' THEN
    v_cash_receipt_id := public.register_court_monthly_package_cash_receipt_internal(
      v_package_id,
      p_company_id,
      v_total,
      v_reference_month,
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'package_id', v_package_id,
    'reference_month', v_reference_month,
    'occurrences_count', v_occurrences_count,
    'charged_occurrences_count', v_charged_count,
    'bonus_occurrences_count', v_bonus_count,
    'subtotal_amount', v_subtotal,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'payment_method', v_payment_method,
    'payment_status', v_payment_status,
    'status', v_package_status,
    'cash_receipt_id', v_cash_receipt_id
  );
END;
$$;

-- Cancelamento em lote: estorna recebimento em dinheiro de cada pacote do lote.
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

    IF v_pkg.payment_method = 'dinheiro' AND v_pkg.payment_status = 'paid' THEN
      PERFORM public.reverse_court_monthly_package_cash_receipt_internal(
        v_pkg.id,
        v_batch.company_id,
        v_actor
      );
    END IF;

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
