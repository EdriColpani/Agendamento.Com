import React from 'react';
import { Crown, Trophy } from 'lucide-react';

interface Props {
  teamName: string;
  tournamentName: string;
  sportName?: string | null;
}

const TournamentChampionBanner: React.FC<Props> = ({ teamName, tournamentName, sportName }) => {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:via-gray-900 dark:to-gray-900"
      aria-label={`Campeão: ${teamName}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50">
          <Trophy className="h-7 w-7" aria-hidden />
        </div>
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
            <Crown className="h-3.5 w-3.5" aria-hidden />
            Campeão do torneio
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            {teamName}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {tournamentName}
            {sportName ? ` · ${sportName}` : ''}
          </p>
        </div>
      </div>
    </section>
  );
};

export default TournamentChampionBanner;
