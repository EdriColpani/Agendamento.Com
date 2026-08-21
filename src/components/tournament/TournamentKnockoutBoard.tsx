import React, { useMemo } from 'react';
import { Crown, Trophy } from 'lucide-react';
import TournamentMatchCard from '@/components/tournament/TournamentMatchCard';
import { KNOCKOUT_ROUND_LABEL } from '@/types/tournament';
import type { TournamentMatch, TournamentTeam } from '@/types/tournament';

interface Props {
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  championTeamId?: string | null;
  locked?: boolean;
  onChanged: () => void;
}

const ROUND_ORDER = ['r16', 'qf', 'sf', 'final'];

function pairsOf<T>(items: T[]): T[][] {
  const pairs: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    pairs.push(items.slice(i, i + 2));
  }
  return pairs;
}

const TournamentKnockoutBoard: React.FC<Props> = ({
  matches,
  teams,
  championTeamId,
  locked,
  onChanged,
}) => {
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const championName = championTeamId ? teamsById[championTeamId]?.name : null;
  const byRound = useMemo(() => {
    const ko = matches.filter((m) => m.stage === 'knockout');
    const keys = [...new Set(ko.map((m) => m.round_key))].sort(
      (a, b) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b),
    );
    return keys.map((key) => ({
      key,
      label: KNOCKOUT_ROUND_LABEL[key] || key,
      items: ko.filter((m) => m.round_key === key).sort((a, b) => a.round_order - b.round_order),
    }));
  }, [matches]);

  if (byRound.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-600">
        A chave aparece quando todos os jogos de grupo forem confirmados.
      </p>
    );
  }

  const firstCount = byRound[0]?.items.length || 1;
  const boardHeight = Math.max(firstCount * 168, 360);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex min-w-max items-stretch">
        {byRound.map((round, roundIndex) => {
          const isLast = roundIndex === byRound.length - 1;
          const groups = isLast ? [round.items] : pairsOf(round.items);
          const cardKind = round.key === 'final' ? 'final' : 'knockout';
          return (
            <div key={round.key} className="flex w-[268px] shrink-0 flex-col sm:w-[284px]">
              <p className="mb-3 px-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                {round.label}
              </p>
              <div className="flex flex-1 flex-col" style={{ minHeight: boardHeight }}>
                {groups.map((group, groupIndex) => (
                  <div key={`${round.key}-${groupIndex}`} className="relative flex flex-1 flex-col justify-around">
                    {group.map((match) => (
                      <div key={match.id} className="flex items-center px-2 py-2">
                        <div className="w-[244px] sm:w-[260px]">
                          <TournamentMatchCard
                            match={match}
                            teamsById={teamsById}
                            locked={locked}
                            kind={cardKind}
                            onChanged={onChanged}
                          />
                        </div>
                      </div>
                    ))}
                    {!isLast && group.length === 2 && (
                      <div
                        className="pointer-events-none absolute right-0 top-[25%] bottom-[25%] w-4 rounded-r-sm border-y border-r border-gray-300 dark:border-gray-600"
                        aria-hidden
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {championName ? (
          <div className="flex w-[220px] shrink-0 flex-col justify-center px-2">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
              Campeão
            </p>
            <div className="mx-auto flex min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-4 py-6 text-center shadow-sm dark:border-amber-800 dark:bg-amber-950/40">
              <Trophy className="h-10 w-10 text-amber-700 dark:text-amber-300" aria-hidden />
              <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
                <Crown className="h-3.5 w-3.5" aria-hidden />
                Campeão
              </p>
              <p className="mt-2 text-lg font-bold leading-tight text-gray-900 dark:text-white">{championName}</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TournamentKnockoutBoard;
