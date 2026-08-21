import { supabase } from '@/integrations/supabase/client';
import type {
  Tournament,
  TournamentGroup,
  TournamentMatch,
  TournamentStanding,
  TournamentTeam,
} from '@/types/tournament';

export interface TournamentDesk {
  tournament: Tournament;
  teams: TournamentTeam[];
  groups: TournamentGroup[];
  matches: TournamentMatch[];
  standings: TournamentStanding[];
}

function rpcError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback);
}

export async function listTournaments(companyId: string): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, company_id, name, sport_name, status, group_count, qualify_per_group, champion_team_id, event_license_id, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw rpcError(error, 'Não foi possível carregar os torneios.');
  return (data || []) as Tournament[];
}

export async function fetchTournamentDesk(tournamentId: string): Promise<TournamentDesk> {
  const [tRes, teamsRes, groupsRes, matchesRes, standingsRes] = await Promise.all([
    supabase.from('tournaments').select('id, company_id, name, sport_name, status, group_count, qualify_per_group, champion_team_id, event_license_id, created_at').eq('id', tournamentId).single(),
    supabase.from('tournament_teams').select('id, tournament_id, group_id, name').eq('tournament_id', tournamentId).order('name'),
    supabase.from('tournament_groups').select('id, tournament_id, name, display_order').eq('tournament_id', tournamentId).order('display_order'),
    supabase.from('tournament_matches').select('id, tournament_id, stage, group_id, round_key, round_order, home_team_id, away_team_id, home_score, away_score, winner_team_id, status').eq('tournament_id', tournamentId).order('round_order'),
    supabase.from('tournament_standings').select('tournament_id, group_id, team_id, played, wins, draws, losses, goals_for, goals_against, goal_diff, points, rank, qualified').eq('tournament_id', tournamentId).order('rank'),
  ]);
  if (tRes.error || !tRes.data) throw rpcError(tRes.error, 'Torneio não encontrado.');
  if (teamsRes.error) throw rpcError(teamsRes.error, 'Não foi possível carregar as equipes.');
  return {
    tournament: tRes.data as Tournament,
    teams: (teamsRes.data || []) as TournamentTeam[],
    groups: (groupsRes.data || []) as TournamentGroup[],
    matches: (matchesRes.data || []) as TournamentMatch[],
    standings: (standingsRes.data || []) as TournamentStanding[],
  };
}

export async function createTournament(params: {
  companyId: string;
  name: string;
  sportName?: string;
  groupCount: number;
  qualifyPerGroup: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_tournament', {
    p_company_id: params.companyId,
    p_name: params.name,
    p_sport_name: params.sportName || null,
    p_group_count: params.groupCount,
    p_qualify_per_group: params.qualifyPerGroup,
  });
  if (error) throw rpcError(error, 'Não foi possível criar o torneio.');
  return data as string;
}

export async function addTournamentTeam(tournamentId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('add_tournament_team', {
    p_tournament_id: tournamentId,
    p_name: name,
  });
  if (error) throw rpcError(error, 'Não foi possível adicionar a equipe.');
}

export async function removeTournamentTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_tournament_team', { p_team_id: teamId });
  if (error) throw rpcError(error, 'Não foi possível remover a equipe.');
}

export async function drawTournamentGroups(tournamentId: string): Promise<void> {
  const { error } = await supabase.rpc('draw_tournament_groups', { p_tournament_id: tournamentId });
  if (error) throw rpcError(error, 'Não foi possível sortear os grupos.');
}

export async function confirmMatchScore(matchId: string, home: number, away: number): Promise<void> {
  const { error } = await supabase.rpc('confirm_tournament_match_score', {
    p_match_id: matchId,
    p_home_score: home,
    p_away_score: away,
  });
  if (error) throw rpcError(error, 'Não foi possível confirmar o placar.');
}

export async function reopenMatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_tournament_match', { p_match_id: matchId });
  if (error) throw rpcError(error, 'Não foi possível desfazer o placar.');
}

export async function grantTournamentLicense(companyId: string, days: number, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('grant_tournament_event_license', {
    p_company_id: companyId,
    p_duration_days: days,
    p_notes: notes || null,
  });
  if (error) throw rpcError(error, 'Não foi possível conceder a licença.');
}
