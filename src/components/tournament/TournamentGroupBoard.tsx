import React from 'react';
import TournamentMatchCard from '@/components/tournament/TournamentMatchCard';
import { OutcomeMark, RankMark } from '@/components/tournament/tournamentMarks';
import type { TournamentGroup, TournamentMatch, TournamentStanding, TournamentTeam } from '@/types/tournament';

interface Props {
  groups: TournamentGroup[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  standings: TournamentStanding[];
  locked?: boolean;
  onChanged: () => void;
}

const TournamentGroupBoard: React.FC<Props> = ({ groups, teams, matches, standings, locked, onChanged }) => {
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const thinGroups = groups.filter((g) => teams.filter((t) => t.group_id === g.id).length < 2).length;

  return (
    <div className="space-y-4">
      {thinGroups > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Alguns grupos ficaram com uma equipe só. Sem confronto, o placar fica zerado e ela passa direto.
          No próximo torneio, cadastre pelo menos 2 equipes por grupo.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const table = standings
            .filter((s) => s.group_id === group.id)
            .sort((a, b) => (a.rank || 99) - (b.rank || 99));
          const groupMatches = matches.filter((m) => m.stage === 'group' && m.group_id === group.id);
          const pending = groupMatches.filter((m) => m.status !== 'confirmed').length;
          const groupDone = groupMatches.length > 0 && pending === 0;
          const onlyOne = table.length < 2;

          return (
            <section
              key={group.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Grupo {group.name}</h3>
                <span className="text-xs font-medium text-gray-500">
                  {onlyOne ? 'Sem jogos' : pending > 0 ? `${pending} jogo(s) em aberto` : 'Grupo encerrado'}
                </span>
              </div>

              {onlyOne ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {teamsById[table[0]?.team_id]?.name || '—'}
                  </p>
                  <OutcomeMark kind="qualified" />
                </div>
              ) : (
                <>
                  <ul className="space-y-2">
                    {table.map((row) => {
                      const showOutcome = groupDone || onlyOne;
                      return (
                        <li
                          key={row.team_id}
                          className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-800"
                        >
                          <RankMark rank={row.rank} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                              {teamsById[row.team_id]?.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {row.played} jogo{row.played === 1 ? '' : 's'} · {row.points} pts · SG{' '}
                              {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                            </p>
                          </div>
                          {showOutcome ? (
                            <OutcomeMark kind={row.qualified ? 'qualified' : 'out'} />
                          ) : (
                            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                              Em disputa
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {table.every((r) => r.played === 0) && (
                    <p className="mt-2 text-xs text-gray-500">A classificação aparece depois do primeiro placar.</p>
                  )}
                  <div className="mt-4 space-y-3">
                    {groupMatches.map((m) => (
                      <TournamentMatchCard
                        key={m.id}
                        match={m}
                        teamsById={teamsById}
                        locked={locked}
                        kind="group"
                        onChanged={onChanged}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default TournamentGroupBoard;
