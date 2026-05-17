-- Geração em lote de pacotes mensais (1, 3, 6, 9 ou 12 meses) a partir do mês inicial.

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
  v_month_offset integer;
  v_reference_month date;
  v_result jsonb;
  v_items jsonb := '[]'::jsonb;
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

  IF v_payment_method IS DISTINCT FROM 'dinheiro' THEN
    RAISE EXCEPTION 'Geração em lote disponível apenas para pagamento no balcão (dinheiro)';
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
        'dinheiro',
        p_notes
      );

      v_created_count := v_created_count + 1;
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'reference_month', v_reference_month,
          'status', 'created',
          'package_id', v_result->>'package_id',
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

  RETURN jsonb_build_object(
    'ok', true,
    'requested_months', p_duration_months,
    'created_count', v_created_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.create_court_monthly_packages_for_period_internal(
  uuid, uuid, text, uuid, date, integer, integer, time, integer, uuid, text, text
) IS
  'Gera pacotes mensais consecutivos (1/3/6/9/12 meses) reutilizando create_court_monthly_package_internal; não aborta o lote em falha pontual.';

REVOKE ALL ON FUNCTION public.create_court_monthly_packages_for_period_internal(
  uuid, uuid, text, uuid, date, integer, integer, time, integer, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_monthly_packages_for_period_internal(
  uuid, uuid, text, uuid, date, integer, integer, time, integer, uuid, text, text
) TO authenticated;
