-- Módulo Torneio (arena): tabelas, flag, feature, menu.
-- NÃO vincula menu_plans nem plan_features — o admin libera depois do teste.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tournament_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.tournament_enabled IS
  'SKU A: módulo torneio no plano (plan_features slug=tournament). SKU B usa tournament_event_licenses.';

CREATE OR REPLACE FUNCTION public.auth_user_belongs_to_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.company_id = p_company_id AND uc.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.collaborators c
    WHERE c.company_id = p_company_id AND c.user_id = auth.uid() AND c.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_belongs_to_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_belongs_to_company(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.tournament_event_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'consumed', 'expired', 'cancelled')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  duration_days integer NOT NULL DEFAULT 7 CHECK (duration_days BETWEEN 1 AND 60),
  tournament_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_licenses_company
  ON public.tournament_event_licenses (company_id, status);

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sport_name text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'groups', 'knockout', 'finished', 'cancelled')),
  group_count integer NOT NULL DEFAULT 4 CHECK (group_count IN (2, 4, 8)),
  qualify_per_group integer NOT NULL DEFAULT 2 CHECK (qualify_per_group IN (1, 2)),
  points_win integer NOT NULL DEFAULT 3,
  points_draw integer NOT NULL DEFAULT 1,
  points_loss integer NOT NULL DEFAULT 0,
  champion_team_id uuid,
  event_license_id uuid REFERENCES public.tournament_event_licenses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournaments_qualifier_power CHECK (
    (group_count * qualify_per_group) IN (2, 4, 8, 16)
  )
);

CREATE INDEX IF NOT EXISTS idx_tournaments_company ON public.tournaments (company_id, created_at DESC);

ALTER TABLE public.tournament_event_licenses
  DROP CONSTRAINT IF EXISTS tournament_event_licenses_tournament_id_fkey;
ALTER TABLE public.tournament_event_licenses
  ADD CONSTRAINT tournament_event_licenses_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE (tournament_id, display_order)
);

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.tournament_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament
  ON public.tournament_teams (tournament_id);

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_champion_team_id_fkey;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_champion_team_id_fkey
  FOREIGN KEY (champion_team_id) REFERENCES public.tournament_teams(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('group', 'knockout')),
  group_id uuid REFERENCES public.tournament_groups(id) ON DELETE CASCADE,
  round_key text NOT NULL DEFAULT 'group',
  round_order integer NOT NULL DEFAULT 0,
  home_team_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  away_team_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  home_score integer,
  away_score integer,
  winner_team_id uuid REFERENCES public.tournament_teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  next_match_id uuid REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  next_slot text CHECK (next_slot IN ('home', 'away')),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament
  ON public.tournament_matches (tournament_id, stage, round_order);

CREATE TABLE IF NOT EXISTS public.tournament_standings (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.tournament_groups(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  goals_for integer NOT NULL DEFAULT 0,
  goals_against integer NOT NULL DEFAULT 0,
  goal_diff integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  rank integer,
  qualified boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tournament_id, team_id)
);

-- Acesso: flag do plano OU licença avulsa vigente (não consumida / torneio ainda aberto).
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
      AND t.status IN ('draft', 'groups', 'knockout')
  );
$$;

COMMENT ON FUNCTION public.company_has_tournament_access(uuid) IS
  'true se a arena tem SKU A (flag) ou SKU B (licença ativa/em uso).';

REVOKE ALL ON FUNCTION public.company_has_tournament_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_tournament_access(uuid) TO authenticated;

-- Sync de flags: inclui tournament_enabled (não vincula a planos aqui).
CREATE OR REPLACE FUNCTION public.sync_company_flags_from_plan(p_company_id uuid, p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  feature_flag_name text;
  flags_to_update jsonb := '{}'::jsonb;
BEGIN
  FOR feature_flag_name IN
    SELECT DISTINCT f.company_flag_name
    FROM public.plan_features pf
    JOIN public.features f ON pf.feature_id = f.id
    WHERE pf.plan_id = p_plan_id
      AND f.company_flag_name IS NOT NULL
      AND f.company_flag_name != ''
  LOOP
    flags_to_update := flags_to_update || jsonb_build_object(feature_flag_name, true);
  END LOOP;

  IF flags_to_update ? 'whatsapp_messaging_enabled' THEN
    UPDATE public.companies
    SET whatsapp_messaging_enabled = true
    WHERE id = p_company_id;
  ELSE
    UPDATE public.companies
    SET whatsapp_messaging_enabled = false
    WHERE id = p_company_id AND whatsapp_messaging_enabled = true;
  END IF;

  IF flags_to_update ? 'court_booking_enabled' THEN
    UPDATE public.companies
    SET court_booking_enabled = true
    WHERE id = p_company_id;
  ELSE
    UPDATE public.companies
    SET court_booking_enabled = false
    WHERE id = p_company_id AND court_booking_enabled = true;
  END IF;

  IF flags_to_update ? 'tournament_enabled' THEN
    UPDATE public.companies
    SET tournament_enabled = true
    WHERE id = p_company_id;
  ELSE
    UPDATE public.companies
    SET tournament_enabled = false
    WHERE id = p_company_id AND tournament_enabled = true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_company_flags_from_plan(uuid, uuid) IS
  'Sincroniza whatsapp_messaging_enabled, court_booking_enabled e tournament_enabled conforme plan_features.';

INSERT INTO public.features (id, slug, name, description, company_flag_name, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'tournament',
  'Torneios',
  'Mesa de torneio: grupos, tabela, chaveamento e campeão automático.',
  'tournament_enabled',
  true,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.features WHERE slug = 'tournament');

INSERT INTO public.menus (menu_key, label, icon, path, display_order, is_active)
VALUES
  ('arena-torneios', 'Torneios', 'fas fa-trophy', '/quadras/torneios', 86, true)
ON CONFLICT (menu_key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  path = EXCLUDED.path,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_event_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_select_member ON public.tournaments;
CREATE POLICY tournament_select_member ON public.tournaments
  FOR SELECT TO authenticated
  USING (public.auth_user_belongs_to_company(company_id) OR public.auth_is_global_admin());

DROP POLICY IF EXISTS tournament_groups_select_member ON public.tournament_groups;
CREATE POLICY tournament_groups_select_member ON public.tournament_groups
  FOR SELECT TO authenticated
  USING (public.auth_user_belongs_to_company(company_id) OR public.auth_is_global_admin());

DROP POLICY IF EXISTS tournament_teams_select_member ON public.tournament_teams;
CREATE POLICY tournament_teams_select_member ON public.tournament_teams
  FOR SELECT TO authenticated
  USING (public.auth_user_belongs_to_company(company_id) OR public.auth_is_global_admin());

DROP POLICY IF EXISTS tournament_matches_select_member ON public.tournament_matches;
CREATE POLICY tournament_matches_select_member ON public.tournament_matches
  FOR SELECT TO authenticated
  USING (public.auth_user_belongs_to_company(company_id) OR public.auth_is_global_admin());

DROP POLICY IF EXISTS tournament_standings_select_member ON public.tournament_standings;
CREATE POLICY tournament_standings_select_member ON public.tournament_standings
  FOR SELECT TO authenticated
  USING (public.auth_user_belongs_to_company(company_id) OR public.auth_is_global_admin());

DROP POLICY IF EXISTS tournament_licenses_select_member ON public.tournament_event_licenses;
CREATE POLICY tournament_licenses_select_member ON public.tournament_event_licenses
  FOR SELECT TO authenticated
  USING (public.auth_user_belongs_to_company(company_id) OR public.auth_is_global_admin());

DROP TRIGGER IF EXISTS trg_require_subscriptions_tournaments ON public.tournaments;
CREATE TRIGGER trg_require_subscriptions_tournaments
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_tournament_groups ON public.tournament_groups;
CREATE TRIGGER trg_require_subscriptions_tournament_groups
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_groups
  FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_tournament_teams ON public.tournament_teams;
CREATE TRIGGER trg_require_subscriptions_tournament_teams
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_teams
  FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_tournament_matches ON public.tournament_matches;
CREATE TRIGGER trg_require_subscriptions_tournament_matches
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_tournament_standings ON public.tournament_standings;
CREATE TRIGGER trg_require_subscriptions_tournament_standings
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_standings
  FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_tournament_licenses ON public.tournament_event_licenses;
CREATE TRIGGER trg_require_subscriptions_tournament_licenses
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_event_licenses
  FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

GRANT SELECT ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournament_groups TO authenticated;
GRANT SELECT ON public.tournament_teams TO authenticated;
GRANT SELECT ON public.tournament_matches TO authenticated;
GRANT SELECT ON public.tournament_standings TO authenticated;
GRANT SELECT ON public.tournament_event_licenses TO authenticated;
