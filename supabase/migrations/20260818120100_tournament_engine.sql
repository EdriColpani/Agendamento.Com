-- Motor do torneio: criar evento, equipes, sorteio de grupos, placar, chave, campeão.

CREATE OR REPLACE FUNCTION public.tournament_assert_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.auth_user_belongs_to_company(p_company_id) OR public.auth_is_global_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para este torneio.';
  END IF;
  IF NOT public.company_has_tournament_access(p_company_id) THEN
    RAISE EXCEPTION 'Módulo de torneio não liberado para esta empresa.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_tournament_event_license(
  p_company_id uuid,
  p_duration_days integer DEFAULT 7,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_days integer;
BEGIN
  IF NOT public.auth_is_global_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador geral pode conceder licença avulsa.';
  END IF;
  v_days := GREATEST(1, LEAST(COALESCE(p_duration_days, 7), 60));
  INSERT INTO public.tournament_event_licenses (
    company_id, status, valid_from, valid_until, duration_days, notes, created_by
  ) VALUES (
    p_company_id, 'active', now(), now() + make_interval(days => v_days), v_days, p_notes, auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_tournament_event_license(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_tournament(
  p_company_id uuid,
  p_name text,
  p_sport_name text DEFAULT NULL,
  p_group_count integer DEFAULT 4,
  p_qualify_per_group integer DEFAULT 2
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_license uuid;
  v_monthly boolean;
BEGIN
  PERFORM public.tournament_assert_access(p_company_id);

  SELECT co.tournament_enabled INTO v_monthly
  FROM public.companies co WHERE co.id = p_company_id;

  IF NOT COALESCE(v_monthly, false) THEN
    SELECT l.id INTO v_license
    FROM public.tournament_event_licenses l
    WHERE l.company_id = p_company_id
      AND l.status = 'active'
      AND l.tournament_id IS NULL
      AND now() <= l.valid_until
    ORDER BY l.valid_until
    LIMIT 1
    FOR UPDATE;
    IF v_license IS NULL THEN
      RAISE EXCEPTION 'Não há licença avulsa vigente. Peça ao administrador ou ative o módulo no plano.';
    END IF;
  END IF;

  INSERT INTO public.tournaments (
    company_id, name, sport_name, group_count, qualify_per_group, event_license_id
  ) VALUES (
    p_company_id,
    NULLIF(btrim(p_name), ''),
    NULLIF(btrim(COALESCE(p_sport_name, '')), ''),
    p_group_count,
    p_qualify_per_group,
    v_license
  )
  RETURNING id INTO v_id;

  IF v_license IS NOT NULL THEN
    UPDATE public.tournament_event_licenses
    SET status = 'consumed', tournament_id = v_id
    WHERE id = v_license;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tournament(uuid, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_tournament_team(
  p_tournament_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  v_id uuid;
  v_count integer;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Torneio não encontrado.'; END IF;
  PERFORM public.tournament_assert_access(v_t.company_id);
  IF v_t.status <> 'draft' THEN
    RAISE EXCEPTION 'Só é possível incluir equipes antes do sorteio.';
  END IF;
  SELECT count(*) INTO v_count FROM public.tournament_teams WHERE tournament_id = p_tournament_id;
  IF v_count >= 32 THEN
    RAISE EXCEPTION 'Limite de 32 equipes por torneio.';
  END IF;
  INSERT INTO public.tournament_teams (tournament_id, company_id, name)
  VALUES (p_tournament_id, v_t.company_id, NULLIF(btrim(p_name), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_tournament_team(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_tournament_team(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  v_team public.tournament_teams%ROWTYPE;
BEGIN
  SELECT * INTO v_team FROM public.tournament_teams WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipe não encontrada.'; END IF;
  SELECT * INTO v_t FROM public.tournaments WHERE id = v_team.tournament_id;
  PERFORM public.tournament_assert_access(v_t.company_id);
  IF v_t.status <> 'draft' THEN
    RAISE EXCEPTION 'Só é possível remover equipes antes do sorteio.';
  END IF;
  DELETE FROM public.tournament_teams WHERE id = p_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_tournament_team(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_tournament_standings(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.tournament_standings WHERE tournament_id = p_tournament_id;

  INSERT INTO public.tournament_standings (
    tournament_id, company_id, group_id, team_id
  )
  SELECT t.tournament_id, t.company_id, t.group_id, t.id
  FROM public.tournament_teams t
  WHERE t.tournament_id = p_tournament_id AND t.group_id IS NOT NULL;

  UPDATE public.tournament_standings s
  SET
    played = agg.played,
    wins = agg.wins,
    draws = agg.draws,
    losses = agg.losses,
    goals_for = agg.gf,
    goals_against = agg.ga,
    goal_diff = agg.gf - agg.ga,
    points = agg.wins * v_t.points_win + agg.draws * v_t.points_draw + agg.losses * v_t.points_loss
  FROM (
    SELECT
      team_id,
      count(*)::int AS played,
      count(*) FILTER (WHERE result = 'W')::int AS wins,
      count(*) FILTER (WHERE result = 'D')::int AS draws,
      count(*) FILTER (WHERE result = 'L')::int AS losses,
      coalesce(sum(gf), 0)::int AS gf,
      coalesce(sum(ga), 0)::int AS ga
    FROM (
      SELECT
        m.home_team_id AS team_id,
        m.home_score AS gf,
        m.away_score AS ga,
        CASE
          WHEN m.home_score > m.away_score THEN 'W'
          WHEN m.home_score < m.away_score THEN 'L'
          ELSE 'D'
        END AS result
      FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
        AND m.stage = 'group'
        AND m.status = 'confirmed'
        AND m.home_team_id IS NOT NULL
      UNION ALL
      SELECT
        m.away_team_id,
        m.away_score,
        m.home_score,
        CASE
          WHEN m.away_score > m.home_score THEN 'W'
          WHEN m.away_score < m.home_score THEN 'L'
          ELSE 'D'
        END
      FROM public.tournament_matches m
      WHERE m.tournament_id = p_tournament_id
        AND m.stage = 'group'
        AND m.status = 'confirmed'
        AND m.away_team_id IS NOT NULL
    ) x
    GROUP BY team_id
  ) agg
  WHERE s.tournament_id = p_tournament_id AND s.team_id = agg.team_id;

  UPDATE public.tournament_standings s
  SET
    rank = r.rk,
    qualified = r.rk <= v_t.qualify_per_group
  FROM (
    SELECT
      team_id,
      rank() OVER (
        PARTITION BY group_id
        ORDER BY points DESC, goal_diff DESC, goals_for DESC, team_id
      ) AS rk
    FROM public.tournament_standings
    WHERE tournament_id = p_tournament_id
  ) r
  WHERE s.tournament_id = p_tournament_id AND s.team_id = r.team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tournament_round_key(p_matches_in_round integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_matches_in_round
    WHEN 1 THEN 'final'
    WHEN 2 THEN 'sf'
    WHEN 4 THEN 'qf'
    WHEN 8 THEN 'r16'
    ELSE 'r' || p_matches_in_round::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.generate_tournament_knockout(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  v_qualified uuid[];
  v_n integer;
  v_size integer;
  v_round_matches integer;
  v_parent uuid;
  v_child uuid;
  v_i integer;
  v_home uuid;
  v_away uuid;
  v_parents uuid[];
  v_children uuid[];
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;

  DELETE FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id AND stage = 'knockout';

  IF v_t.group_count = 4 AND v_t.qualify_per_group = 2 THEN
    SELECT array_agg(team_id ORDER BY ord)
    INTO v_qualified
    FROM (
      SELECT s.team_id,
        CASE
          WHEN g.display_order = 0 AND s.rank = 1 THEN 1
          WHEN g.display_order = 1 AND s.rank = 2 THEN 2
          WHEN g.display_order = 2 AND s.rank = 1 THEN 3
          WHEN g.display_order = 3 AND s.rank = 2 THEN 4
          WHEN g.display_order = 1 AND s.rank = 1 THEN 5
          WHEN g.display_order = 0 AND s.rank = 2 THEN 6
          WHEN g.display_order = 3 AND s.rank = 1 THEN 7
          WHEN g.display_order = 2 AND s.rank = 2 THEN 8
          ELSE 20
        END AS ord
      FROM public.tournament_standings s
      JOIN public.tournament_groups g ON g.id = s.group_id
      WHERE s.tournament_id = p_tournament_id AND s.qualified = true
    ) q
    WHERE ord <= 8;
  ELSE
    SELECT array_agg(team_id ORDER BY g.display_order, s.rank)
    INTO v_qualified
    FROM public.tournament_standings s
    JOIN public.tournament_groups g ON g.id = s.group_id
    WHERE s.tournament_id = p_tournament_id AND s.qualified = true;
  END IF;

  v_n := coalesce(array_length(v_qualified, 1), 0);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'É preciso ao menos 2 classificados para o mata-mata.';
  END IF;

  v_size := 2;
  WHILE v_size < v_n LOOP
    v_size := v_size * 2;
  END LOOP;

  INSERT INTO public.tournament_matches (
    tournament_id, company_id, stage, round_key, round_order
  ) VALUES (
    p_tournament_id, v_t.company_id, 'knockout', 'final', 0
  )
  RETURNING id INTO v_parent;
  v_parents := ARRAY[v_parent];

  v_round_matches := 2;
  WHILE v_round_matches <= (v_size / 2) LOOP
    v_children := ARRAY[]::uuid[];
    FOR v_i IN 1..array_length(v_parents, 1) LOOP
      INSERT INTO public.tournament_matches (
        tournament_id, company_id, stage, round_key, round_order, next_match_id, next_slot
      ) VALUES (
        p_tournament_id, v_t.company_id, 'knockout',
        public.tournament_round_key(v_round_matches),
        (v_i - 1) * 2,
        v_parents[v_i],
        'home'
      )
      RETURNING id INTO v_child;
      v_children := v_children || v_child;

      INSERT INTO public.tournament_matches (
        tournament_id, company_id, stage, round_key, round_order, next_match_id, next_slot
      ) VALUES (
        p_tournament_id, v_t.company_id, 'knockout',
        public.tournament_round_key(v_round_matches),
        (v_i - 1) * 2 + 1,
        v_parents[v_i],
        'away'
      )
      RETURNING id INTO v_child;
      v_children := v_children || v_child;
    END LOOP;
    v_parents := v_children;
    v_round_matches := v_round_matches * 2;
  END LOOP;

  v_i := 1;
  FOR v_i IN 1..array_length(v_parents, 1) LOOP
    v_home := v_qualified[(v_i - 1) * 2 + 1];
    v_away := v_qualified[(v_i - 1) * 2 + 2];
    UPDATE public.tournament_matches
    SET home_team_id = v_home, away_team_id = v_away
    WHERE id = v_parents[v_i];

    IF v_home IS NOT NULL AND v_away IS NULL THEN
      UPDATE public.tournament_matches
      SET winner_team_id = v_home, status = 'confirmed', home_score = 0, away_score = 0, confirmed_at = now()
      WHERE id = v_parents[v_i];
      PERFORM public.tournament_advance_winner(v_parents[v_i], v_home);
    END IF;
  END LOOP;

  UPDATE public.tournaments SET status = 'knockout', updated_at = now() WHERE id = p_tournament_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tournament_advance_winner(p_match_id uuid, p_winner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m public.tournament_matches%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_match_id;
  IF v_m.next_match_id IS NULL THEN
    UPDATE public.tournaments
    SET champion_team_id = p_winner, status = 'finished', updated_at = now()
    WHERE id = v_m.tournament_id;
    RETURN;
  END IF;
  IF v_m.next_slot = 'home' THEN
    UPDATE public.tournament_matches SET home_team_id = p_winner WHERE id = v_m.next_match_id;
  ELSE
    UPDATE public.tournament_matches SET away_team_id = p_winner WHERE id = v_m.next_match_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_generate_knockout_if_ready(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending integer;
  v_t public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;
  IF v_t.status <> 'groups' THEN RETURN; END IF;
  SELECT count(*) INTO v_pending
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id AND stage = 'group' AND status = 'pending';
  IF v_pending = 0 THEN
    PERFORM public.generate_tournament_knockout(p_tournament_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_tournament_groups(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.tournaments%ROWTYPE;
  v_confirmed integer;
  v_teams integer;
  v_i integer;
  v_gid uuid;
  rec record;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Torneio não encontrado.'; END IF;
  PERFORM public.tournament_assert_access(v_t.company_id);

  SELECT count(*) INTO v_confirmed
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id AND status = 'confirmed';
  IF v_confirmed > 0 THEN
    RAISE EXCEPTION 'Não é possível sortear de novo depois que um jogo foi confirmado.';
  END IF;

  SELECT count(*) INTO v_teams FROM public.tournament_teams WHERE tournament_id = p_tournament_id;
    IF v_teams < (v_t.group_count * 2) THEN
      RAISE EXCEPTION 'Cadastre ao menos % equipes (2 por grupo).', v_t.group_count * 2;
  END IF;

  DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament_id;
  DELETE FROM public.tournament_standings WHERE tournament_id = p_tournament_id;
  UPDATE public.tournament_teams SET group_id = NULL WHERE tournament_id = p_tournament_id;
  DELETE FROM public.tournament_groups WHERE tournament_id = p_tournament_id;

  FOR v_i IN 0..(v_t.group_count - 1) LOOP
    INSERT INTO public.tournament_groups (tournament_id, company_id, name, display_order)
    VALUES (p_tournament_id, v_t.company_id, chr(65 + v_i), v_i);
  END LOOP;

  v_i := 0;
  FOR rec IN
    SELECT id FROM public.tournament_teams WHERE tournament_id = p_tournament_id ORDER BY random()
  LOOP
    SELECT id INTO v_gid
    FROM public.tournament_groups
    WHERE tournament_id = p_tournament_id AND display_order = (v_i % v_t.group_count);
    UPDATE public.tournament_teams SET group_id = v_gid WHERE id = rec.id;
    v_i := v_i + 1;
  END LOOP;

  FOR rec IN SELECT id FROM public.tournament_groups WHERE tournament_id = p_tournament_id LOOP
    INSERT INTO public.tournament_matches (
      tournament_id, company_id, stage, group_id, round_key, home_team_id, away_team_id
    )
    SELECT
      p_tournament_id, v_t.company_id, 'group', rec.id, 'group', a.id, b.id
    FROM public.tournament_teams a
    JOIN public.tournament_teams b
      ON a.group_id = rec.id AND b.group_id = rec.id AND a.id < b.id;
  END LOOP;

  UPDATE public.tournaments SET status = 'groups', champion_team_id = NULL, updated_at = now()
  WHERE id = p_tournament_id;

  PERFORM public.recalculate_tournament_standings(p_tournament_id);
  PERFORM public.try_generate_knockout_if_ready(p_tournament_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.draw_tournament_groups(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_tournament_match_score(
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m public.tournament_matches%ROWTYPE;
  v_winner uuid;
BEGIN
  IF p_home_score IS NULL OR p_away_score IS NULL OR p_home_score < 0 OR p_away_score < 0 THEN
    RAISE EXCEPTION 'Informe um placar válido (zero ou mais).';
  END IF;

  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogo não encontrado.'; END IF;
  PERFORM public.tournament_assert_access(v_m.company_id);
  IF v_m.status = 'confirmed' THEN
    RAISE EXCEPTION 'Este jogo já foi confirmado. Use desfazer se precisar corrigir.';
  END IF;
  IF v_m.home_team_id IS NULL OR v_m.away_team_id IS NULL THEN
    RAISE EXCEPTION 'Aguarde os dois lados da chave antes de lançar o placar.';
  END IF;
  IF v_m.stage = 'knockout' AND p_home_score = p_away_score THEN
    RAISE EXCEPTION 'Empate não é permitido no mata-mata.';
  END IF;

  IF p_home_score > p_away_score THEN
    v_winner := v_m.home_team_id;
  ELSIF p_away_score > p_home_score THEN
    v_winner := v_m.away_team_id;
  ELSE
    v_winner := NULL;
  END IF;

  UPDATE public.tournament_matches
  SET home_score = p_home_score,
      away_score = p_away_score,
      winner_team_id = v_winner,
      status = 'confirmed',
      confirmed_at = now()
  WHERE id = p_match_id;

  IF v_m.stage = 'group' THEN
    PERFORM public.recalculate_tournament_standings(v_m.tournament_id);
    PERFORM public.try_generate_knockout_if_ready(v_m.tournament_id);
  ELSE
    PERFORM public.tournament_advance_winner(p_match_id, v_winner);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_tournament_match_score(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_tournament_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m public.tournament_matches%ROWTYPE;
  v_next public.tournament_matches%ROWTYPE;
  v_ko_confirmed integer;
BEGIN
  SELECT * INTO v_m FROM public.tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogo não encontrado.'; END IF;
  PERFORM public.tournament_assert_access(v_m.company_id);
  IF v_m.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Este jogo ainda não foi confirmado.';
  END IF;

  IF v_m.next_match_id IS NOT NULL THEN
    SELECT * INTO v_next FROM public.tournament_matches WHERE id = v_m.next_match_id;
    IF v_next.status = 'confirmed' THEN
      RAISE EXCEPTION 'Não é possível desfazer: o próximo jogo já foi confirmado.';
    END IF;
    IF v_m.next_slot = 'home' THEN
      UPDATE public.tournament_matches SET home_team_id = NULL WHERE id = v_m.next_match_id;
    ELSE
      UPDATE public.tournament_matches SET away_team_id = NULL WHERE id = v_m.next_match_id;
    END IF;
  END IF;

  UPDATE public.tournament_matches
  SET home_score = NULL, away_score = NULL, winner_team_id = NULL, status = 'pending', confirmed_at = NULL
  WHERE id = p_match_id;

  UPDATE public.tournaments
  SET champion_team_id = NULL,
      status = CASE WHEN status = 'finished' THEN 'knockout' ELSE status END,
      updated_at = now()
  WHERE id = v_m.tournament_id;

  IF v_m.stage = 'group' THEN
    SELECT count(*) INTO v_ko_confirmed
    FROM public.tournament_matches
    WHERE tournament_id = v_m.tournament_id AND stage = 'knockout' AND status = 'confirmed';
    IF v_ko_confirmed = 0 THEN
      DELETE FROM public.tournament_matches
      WHERE tournament_id = v_m.tournament_id AND stage = 'knockout';
      UPDATE public.tournaments SET status = 'groups', champion_team_id = NULL, updated_at = now()
      WHERE id = v_m.tournament_id;
    END IF;
    PERFORM public.recalculate_tournament_standings(v_m.tournament_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_tournament_match(uuid) TO authenticated;
