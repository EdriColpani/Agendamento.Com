import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showError, showSuccess } from '@/utils/toast';
import { confirmMatchScore, reopenMatch } from '@/services/tournamentApi';
import type { TournamentMatch, TournamentTeam } from '@/types/tournament';
import { cn } from '@/lib/utils';
import { Undo2 } from 'lucide-react';
import { OutcomeMark, teamInitials, type OutcomeKind } from '@/components/tournament/tournamentMarks';

interface Props {
  match: TournamentMatch;
  teamsById: Record<string, TournamentTeam>;
  locked?: boolean;
  kind?: 'group' | 'knockout' | 'final';
  onChanged: () => void;
}

function scoreLine(home: number | null, away: number | null): string {
  return `${home ?? 0} a ${away ?? 0}`;
}

const TournamentMatchCard: React.FC<Props> = ({
  match,
  teamsById,
  locked,
  kind = 'group',
  onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [saving, setSaving] = useState(false);

  const homeName = match.home_team_id ? teamsById[match.home_team_id]?.name || 'Equipe' : 'A definir';
  const awayName = match.away_team_id ? teamsById[match.away_team_id]?.name || 'Equipe' : 'A definir';
  const ready = Boolean(match.home_team_id && match.away_team_id);
  const confirmed = match.status === 'confirmed';
  const isDraw = confirmed && match.home_score === match.away_score;
  const homeWon = confirmed && match.winner_team_id === match.home_team_id;
  const awayWon = confirmed && match.winner_team_id === match.away_team_id;
  const winnerName = homeWon ? homeName : awayWon ? awayName : null;

  const markFor = (won: boolean): OutcomeKind | null => {
    if (!confirmed) return null;
    if (isDraw) return 'draw';
    if (!won) return kind === 'group' ? null : kind === 'final' ? 'runner' : 'out';
    if (kind === 'final') return 'champion';
    if (kind === 'knockout') return 'advances';
    return 'won';
  };

  const handleConfirm = async () => {
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      showError('Informe placar com números inteiros (0 ou mais).');
      return;
    }
    setSaving(true);
    try {
      await confirmMatchScore(match.id, h, a);
      showSuccess('Placar confirmado.');
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao confirmar.');
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    setSaving(true);
    try {
      await reopenMatch(match.id);
      showSuccess('Placar desfeito.');
      onChanged();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao desfazer.');
    } finally {
      setSaving(false);
    }
  };

  const teamRow = (name: string, score: number | null, won: boolean, pending: boolean) => {
    const mark = markFor(won);
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2.5',
          won && confirmed && 'bg-emerald-50 dark:bg-emerald-950/30',
          kind === 'final' && won && confirmed && 'bg-amber-50 dark:bg-amber-950/30',
          confirmed && !won && !isDraw && 'opacity-70',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            pending ? 'bg-gray-100 text-gray-400' : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
            won && confirmed && 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50',
            kind === 'final' && won && confirmed && 'bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50',
          )}
          aria-hidden
        >
          {pending ? '—' : teamInitials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm', won || isDraw ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200')}>
            {name}
          </p>
          {mark ? <OutcomeMark kind={mark} className="mt-1" /> : null}
        </div>
        <span className="w-8 shrink-0 text-right text-lg font-bold tabular-nums text-gray-900 dark:text-white">
          {confirmed ? score : '–'}
        </span>
      </div>
    );
  };

  const resultText = !confirmed
    ? ready
      ? 'Aguardando placar'
      : 'Aguardando adversário'
    : isDraw
      ? `Empate em ${scoreLine(match.home_score, match.away_score)}`
      : kind === 'final'
        ? `Campeão: ${winnerName} · ${scoreLine(match.home_score, match.away_score)}`
        : `${winnerName} venceu por ${scoreLine(match.home_score, match.away_score)}`;

  return (
    <>
      <article
        className={cn(
          'w-full overflow-hidden rounded-xl border bg-white text-sm shadow-sm dark:bg-gray-900',
          confirmed ? 'border-gray-200 dark:border-gray-700' : 'border-dashed border-gray-300 dark:border-gray-600',
          ready && !confirmed && 'border-primary/50',
          kind === 'final' && confirmed && homeWon && 'border-amber-300 dark:border-amber-700',
          kind === 'final' && confirmed && awayWon && 'border-amber-300 dark:border-amber-700',
        )}
        aria-label={`${homeName} versus ${awayName}. ${resultText}`}
      >
        {teamRow(homeName, match.home_score, homeWon, !match.home_team_id)}
        <div className="h-px bg-gray-100 dark:bg-gray-800" />
        {teamRow(awayName, match.away_score, awayWon, !match.away_team_id)}

        <p className="border-t border-gray-100 px-3 py-2 text-xs font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
          {resultText}
        </p>

        {!locked && ready && !confirmed && (
          <button
            type="button"
            className="w-full bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground"
            onClick={() => {
              setHome('');
              setAway('');
              setOpen(true);
            }}
          >
            Lançar placar
          </button>
        )}
        {!locked && confirmed && (
          <div className="flex justify-end border-t border-gray-100 px-1 dark:border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-gray-500"
              title="Desfazer placar"
              aria-label="Desfazer placar"
              onClick={() => void handleReopen()}
              disabled={saving}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" />
              Desfazer
            </Button>
          </div>
        )}
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Placar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {homeName} vs {awayName}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">{homeName}</p>
              <Input inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} className="h-11" />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">{awayName}</p>
              <Input inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleConfirm()} disabled={saving}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TournamentMatchCard;
