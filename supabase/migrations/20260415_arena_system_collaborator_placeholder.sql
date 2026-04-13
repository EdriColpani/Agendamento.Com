-- Colaborador placeholder por empresa para reservas de quadra (booking_kind = court),
-- mantendo appointments.collaborator_id NOT NULL sem exigir profissional real.

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS is_arena_system_placeholder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.collaborators.is_arena_system_placeholder IS
  'true = registro técnico usado apenas em agendamentos de quadra; não é pessoa.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'collaborators'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.collaborators ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborators_one_arena_placeholder_per_company
  ON public.collaborators (company_id)
  WHERE is_arena_system_placeholder = true;

CREATE OR REPLACE FUNCTION public.get_or_create_arena_system_collaborator(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_role integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('arena_sys_collab:' || p_company_id::text));

  SELECT c.id INTO v_id
  FROM public.collaborators c
  WHERE c.company_id = p_company_id
    AND c.is_arena_system_placeholder = true
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT rt.id INTO v_role
  FROM public.role_types rt
  ORDER BY rt.id
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Configuração incompleta: role_types vazio';
  END IF;

  INSERT INTO public.collaborators (
    company_id,
    user_id,
    first_name,
    last_name,
    email,
    phone_number,
    hire_date,
    role_type_id,
    commission_percentage,
    status,
    is_active,
    is_arena_system_placeholder
  ) VALUES (
    p_company_id,
    NULL,
    'Sistema',
    '(Arena)',
    'arena-ph-' || replace(p_company_id::text, '-', '') || '@placeholder.tipoagenda.local',
    '00000000000',
    CURRENT_DATE,
    v_role,
    0,
    'Ativo',
    true,
    true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT c.id INTO v_id
    FROM public.collaborators c
    WHERE c.company_id = p_company_id
      AND c.is_arena_system_placeholder = true
    LIMIT 1;
    IF v_id IS NULL THEN
      RAISE;
    END IF;
    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_arena_system_collaborator(uuid) IS
  'Retorna (criando se necessário) o colaborador técnico da empresa para agendamentos de quadra.';

REVOKE ALL ON FUNCTION public.get_or_create_arena_system_collaborator(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_court_booking(
  p_company_id uuid,
  p_court_id uuid,
  p_client_id uuid,
  p_client_nickname text,
  p_appointment_date date,
  p_appointment_time time,
  p_duration_minutes integer,
  p_observations text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_ns int;
  v_ne int;
  v_collaborator_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = v_actor
  ) AND NOT EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = p_company_id AND c.user_id = v_actor AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão nesta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts ct
    WHERE ct.id = p_court_id AND ct.company_id = p_company_id AND ct.is_active = true
  ) THEN
    RAISE EXCEPTION 'Quadra inválida ou inativa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE cl.id = p_client_id AND cl.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido';
  END IF;

  v_collaborator_id := public.get_or_create_arena_system_collaborator(p_company_id);

  v_ns := EXTRACT(HOUR FROM p_appointment_time)::int * 60 + EXTRACT(MINUTE FROM p_appointment_time)::int;
  v_ne := v_ns + p_duration_minutes;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.court_id = p_court_id
      AND a.appointment_date = p_appointment_date
      AND COALESCE(a.status, '') <> 'cancelado'
      AND (
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int) < v_ne
        AND
        (EXTRACT(HOUR FROM a.appointment_time)::int * 60 + EXTRACT(MINUTE FROM a.appointment_time)::int
          + COALESCE(a.total_duration_minutes, 60)) > v_ns
      )
  ) THEN
    RAISE EXCEPTION 'Horário indisponível para esta quadra';
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
    observations,
    created_by_user_id,
    status,
    booking_kind,
    court_id
  ) VALUES (
    p_company_id,
    p_client_id,
    NULLIF(trim(COALESCE(p_client_nickname, '')), ''),
    v_collaborator_id,
    p_appointment_date,
    p_appointment_time,
    p_duration_minutes,
    0,
    NULLIF(trim(COALESCE(p_observations, '')), ''),
    v_actor,
    'pendente',
    'court',
    p_court_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_court_booking IS
  'Cria agendamento booking_kind=court com validação de conflito; usa colaborador placeholder da empresa.';

REVOKE ALL ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_court_booking(uuid, uuid, uuid, text, date, time, integer, text) TO authenticated;
