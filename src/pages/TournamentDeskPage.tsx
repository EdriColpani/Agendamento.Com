import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import { useTournamentAccess } from '@/hooks/useTournamentAccess';
import {
  addTournamentTeam,
  drawTournamentGroups,
  fetchTournamentDesk,
  removeTournamentTeam,
  type TournamentDesk,
} from '@/services/tournamentApi';
import TournamentGroupBoard from '@/components/tournament/TournamentGroupBoard';
import TournamentKnockoutBoard from '@/components/tournament/TournamentKnockoutBoard';
import TournamentChampionBanner from '@/components/tournament/TournamentChampionBanner';
import { showError, showSuccess } from '@/utils/toast';
import { TOURNAMENT_STATUS_LABEL } from '@/types/tournament';
import { arenaTouchButtonClass } from '@/components/arena/arenaPageStyles';
import { Trash2 } from 'lucide-react';

const TournamentDeskPage: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const navigate = useNavigate();
  const { canUseTournament, loading } = useTournamentAccess();
  const [desk, setDesk] = useState<TournamentDesk | null>(null);
  const [loadingDesk, setLoadingDesk] = useState(true);
  const [teamName, setTeamName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoadingDesk(true);
    try {
      setDesk(await fetchTournamentDesk(tournamentId));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar a mesa.');
      setDesk(null);
    } finally {
      setLoadingDesk(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (canUseTournament) void load();
  }, [canUseTournament, load]);

  const handleAddTeam = async () => {
    if (!tournamentId || !teamName.trim()) return;
    setSaving(true);
    try {
      await addTournamentTeam(tournamentId, teamName.trim());
      setTeamName('');
      await load();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao adicionar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDraw = async () => {
    if (!tournamentId) return;
    setSaving(true);
    try {
      await drawTournamentGroups(tournamentId);
      showSuccess('Grupos sorteados.');
      await load();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha no sorteio.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || loadingDesk) {
    return <p className="p-6 text-gray-600">Carregando mesa...</p>;
  }
  if (!canUseTournament) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold text-gray-900">Mesa do torneio</h1>
        <p className="text-sm text-gray-600">Este módulo não está liberado para a empresa atual.</p>
        <Button variant="outline" onClick={() => navigate('/quadras/torneios')}>
          Voltar
        </Button>
      </div>
    );
  }
  if (!desk) {
    return <p className="p-6 text-gray-600">Torneio não encontrado.</p>;
  }

  const { tournament, teams } = desk;
  const champion = teams.find((t) => t.id === tournament.champion_team_id);
  const locked = tournament.status === 'finished';
  const isDraft = tournament.status === 'draft';
  const minTeams = tournament.group_count * 2;
  const canDraw = teams.length >= minTeams;

  return (
    <div className="space-y-6">
      <ArenaPageHeader
        title={tournament.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className={arenaTouchButtonClass} onClick={() => navigate('/quadras/torneios')}>
              Voltar
            </Button>
            {isDraft && (
              <Button className={arenaTouchButtonClass} onClick={() => void handleDraw()} disabled={saving || !canDraw}>
                Sortear grupos
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge>{TOURNAMENT_STATUS_LABEL[tournament.status]}</Badge>
        {tournament.sport_name ? <span className="text-sm text-gray-600">{tournament.sport_name}</span> : null}
      </div>

      {champion ? (
        <TournamentChampionBanner
          teamName={champion.name}
          tournamentName={tournament.name}
          sportName={tournament.sport_name}
        />
      ) : null}

      {isDraft && (
        <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <h2 className="font-semibold">Equipes ({teams.length}/{minTeams} mín.)</h2>
          <p className="text-sm text-gray-600">
            {tournament.group_count} grupos, {tournament.qualify_per_group} classificado{tournament.qualify_per_group > 1 ? 's' : ''} por grupo.
            Cadastre pelo menos {minTeams} equipes (2 em cada grupo) para haver jogos.
          </p>
          <div className="flex gap-2">
            <Input
              className="h-11"
              placeholder="Nome da equipe"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddTeam();
              }}
            />
            <Button className={arenaTouchButtonClass} onClick={() => void handleAddTeam()} disabled={saving}>
              Adicionar
            </Button>
          </div>
          <ul className="space-y-1">
            {teams.map((team) => (
              <li key={team.id} className="flex items-center justify-between text-sm">
                <span>{team.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await removeTournamentTeam(team.id);
                      await load();
                    } catch (err: unknown) {
                      showError(err instanceof Error ? err.message : 'Falha ao remover.');
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isDraft && (
        <Tabs defaultValue={tournament.status === 'knockout' || tournament.status === 'finished' ? 'chave' : 'grupos'}>
          <TabsList className="h-11">
            <TabsTrigger value="grupos" className="px-4">Grupos</TabsTrigger>
            <TabsTrigger value="chave" className="px-4">Mata-mata</TabsTrigger>
          </TabsList>
          <TabsContent value="grupos" className="mt-4">
            <TournamentGroupBoard
              groups={desk.groups}
              teams={desk.teams}
              matches={desk.matches}
              standings={desk.standings}
              locked={locked}
              onChanged={() => void load()}
            />
          </TabsContent>
          <TabsContent value="chave" className="mt-4">
            <TournamentKnockoutBoard
              matches={desk.matches}
              teams={desk.teams}
              championTeamId={tournament.champion_team_id}
              locked={locked}
              onChanged={() => void load()}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default TournamentDeskPage;
