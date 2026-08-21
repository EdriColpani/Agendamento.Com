export type TournamentStatus = 'draft' | 'groups' | 'knockout' | 'finished' | 'cancelled';
export type TournamentStage = 'group' | 'knockout';
export type MatchStatus = 'pending' | 'confirmed';

export interface Tournament {
  id: string;
  company_id: string;
  name: string;
  sport_name: string | null;
  status: TournamentStatus;
  group_count: number;
  qualify_per_group: number;
  champion_team_id: string | null;
  event_license_id: string | null;
  created_at: string;
}

export interface TournamentTeam {
  id: string;
  tournament_id: string;
  group_id: string | null;
  name: string;
}

export interface TournamentGroup {
  id: string;
  tournament_id: string;
  name: string;
  display_order: number;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  stage: TournamentStage;
  group_id: string | null;
  round_key: string;
  round_order: number;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  status: MatchStatus;
}

export interface TournamentStanding {
  tournament_id: string;
  group_id: string;
  team_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  rank: number | null;
  qualified: boolean;
}

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: 'Rascunho',
  groups: 'Fase de grupos',
  knockout: 'Mata-mata',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
};

export const KNOCKOUT_ROUND_LABEL: Record<string, string> = {
  r16: 'Oitavas',
  qf: 'Quartas',
  sf: 'Semifinal',
  final: 'Final',
};
