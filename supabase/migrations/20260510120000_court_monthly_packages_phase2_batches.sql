-- Fase 2: lotes de geração em período, vínculo batch_id nos pacotes e pré-visualização.

CREATE TABLE IF NOT EXISTS public.court_monthly_package_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  court_id uuid NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
  plan_id uuid NULL REFERENCES public.court_monthly_plans(id) ON DELETE SET NULL,
  start_month date NOT NULL,
  duration_months integer NOT NULL CHECK (duration_months IN (1, 3, 6, 9, 12)),
  week_day integer NOT NULL CHECK (week_day BETWEEN 0 AND 6),
  start_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes >= 1 AND duration_minutes <= 1440),
  payment_method text NOT NULL DEFAULT 'dinheiro' CHECK (payment_method = 'dinheiro'),
  notes text NULL,
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT court_monthly_package_batches_start_month_first_day CHECK (
    start_month = date_trunc('month', start_month)::date
  )
);

COMMENT ON TABLE public.court_monthly_package_batches IS
  'Registro de uma geração em lote de pacotes mensais (período 1/3/6/9/12 meses).';

CREATE INDEX IF NOT EXISTS idx_court_monthly_package_batches_company_created
  ON public.court_monthly_package_batches(company_id, created_at DESC);

ALTER TABLE public.court_monthly_packages
  ADD COLUMN IF NOT EXISTS batch_id uuid NULL
  REFERENCES public.court_monthly_package_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_court_monthly_packages_batch_id
  ON public.court_monthly_packages(batch_id)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.court_monthly_package_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "court_monthly_package_batches_select_owner_admin" ON public.court_monthly_package_batches;
CREATE POLICY "court_monthly_package_batches_select_owner_admin"
ON public.court_monthly_package_batches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_package_batches.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

-- Pré-visualização: meses do período e status (disponível vs duplicata), sem criar pacotes.
CREATE OR REPLACE FUNCTION public.preview_court_monthly_packages_period_internal(
  p_company_id uuid,
  p_client_id uuid,
  p_court_id uuid,
  p_start_month date,
  p_duration_months integer,
  p_week_day integer,
  p_start_time time,
  p_duration_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_start_month date := date_trunc('month', p_start_month)::date;
  v_current_month date := date_trunc('month', current_date)::date;
  v_month_offset integer;
  v_reference_month date;
  v_months jsonb := '[]'::jsonb;
  v_available_count integer := 0;
  v_duplicate_count integer := 0;
  v_status text;
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
    RAISE EXCEPTION 'Sem permissão';
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
      v_status := 'duplicate';
      v_duplicate_count := v_duplicate_count + 1;
    ELSE
      v_status := 'available';
      v_available_count := v_available_count + 1;
    END IF;

    v_months := v_months || jsonb_build_array(
      jsonb_build_object(
        'reference_month', v_reference_month,
        'status', v_status
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'requested_months', p_duration_months,
    'available_count', v_available_count,
    'duplicate_count', v_duplicate_count,
    'months', v_months
  );
END;
$$;

COMMENT ON FUNCTION public.preview_court_monthly_packages_period_internal(
  uuid, uuid, uuid, date, integer, integer, time, integer
) IS
  'Pré-visualiza meses do período e indica duplicatas antes da geração em lote.';

REVOKE ALL ON FUNCTION public.preview_court_monthly_packages_period_internal(
  uuid, uuid, uuid, date, integer, integer, time, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_court_monthly_packages_period_internal(
  uuid, uuid, uuid, date, integer, integer, time, integer
) TO authenticated;

-- Atualiza geração em lote: registra batch e vincula pacotes criados.
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
    'dinheiro',
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
        'dinheiro',
        p_notes
      );

      v_package_id := (v_result->>'package_id')::uuid;
      IF v_package_id IS NOT NULL THEN
        UPDATE public.court_monthly_packages
        SET batch_id = v_batch_id
        WHERE id = v_package_id;
      END IF;

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

  UPDATE public.court_monthly_package_batches
  SET
    created_count = v_created_count,
    skipped_count = v_skipped_count,
    failed_count = v_failed_count
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'requested_months', p_duration_months,
    'created_count', v_created_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'items', v_items
  );
END;
$$;
