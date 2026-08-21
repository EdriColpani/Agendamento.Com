-- Licença avulsa (SKU B): após encerrar o torneio, a empresa continua
-- podendo abrir o módulo e ver o histórico. Criar outro evento exige
-- nova licença ou flag mensal (SKU A).

CREATE OR REPLACE FUNCTION public.company_has_tournament_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies co
    LEFT JOIN public.segment_types st ON st.id = co.segment_type
    WHERE co.id = p_company_id
      AND COALESCE(st.scheduling_mode, 'service') = 'court'
      AND co.tournament_enabled = true
  ) OR EXISTS (
    SELECT 1
    FROM public.tournament_event_licenses l
    WHERE l.company_id = p_company_id
      AND l.status = 'active'
      AND now() <= l.valid_until
      AND l.tournament_id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.tournament_event_licenses l
    JOIN public.tournaments t ON t.id = l.tournament_id
    WHERE l.company_id = p_company_id
      AND l.status = 'consumed'
      AND t.status IN ('draft', 'groups', 'knockout', 'finished')
  ) OR EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.company_id = p_company_id
      AND t.status <> 'cancelled'
  );
$$;

COMMENT ON FUNCTION public.company_has_tournament_access(uuid) IS
  'true se a arena tem SKU A (flag), SKU B vigente, ou torneio já criado (incluindo encerrado).';

CREATE OR REPLACE FUNCTION public.company_can_create_tournament(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies co
    LEFT JOIN public.segment_types st ON st.id = co.segment_type
    WHERE co.id = p_company_id
      AND COALESCE(st.scheduling_mode, 'service') = 'court'
      AND co.tournament_enabled = true
  ) OR EXISTS (
    SELECT 1
    FROM public.tournament_event_licenses l
    WHERE l.company_id = p_company_id
      AND l.status = 'active'
      AND now() <= l.valid_until
      AND l.tournament_id IS NULL
  );
$$;

COMMENT ON FUNCTION public.company_can_create_tournament(uuid) IS
  'true se a arena pode criar um novo torneio (SKU A ou licença avulsa ainda não usada).';

REVOKE ALL ON FUNCTION public.company_can_create_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_can_create_tournament(uuid) TO authenticated;
