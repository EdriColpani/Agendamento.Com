import React from 'react';
import { Check, Crown, Medal, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OutcomeKind = 'won' | 'advances' | 'draw' | 'out' | 'qualified' | 'champion' | 'runner';

const OUTCOME: Record<
  OutcomeKind,
  { label: string; className: string; Icon: typeof Trophy | null }
> = {
  won: {
    label: 'Venceu',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
    Icon: Trophy,
  },
  advances: {
    label: 'Avança',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
    Icon: Check,
  },
  draw: {
    label: 'Empate',
    className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
    Icon: null,
  },
  out: {
    label: 'Eliminado',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    Icon: X,
  },
  qualified: {
    label: 'Classificado',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
    Icon: Check,
  },
  champion: {
    label: 'Campeão',
    className: 'bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100',
    Icon: Crown,
  },
  runner: {
    label: 'Vice',
    className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
    Icon: Medal,
  },
};

export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function OutcomeMark({ kind, className }: { kind: OutcomeKind; className?: string }) {
  const item = OUTCOME[kind];
  const Icon = item.Icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        item.className,
        className,
      )}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {item.label}
    </span>
  );
}

export function RankMark({ rank }: { rank: number | null }) {
  const n = rank || 0;
  const tone =
    n === 1
      ? 'bg-amber-100 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100'
      : n === 2
        ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        tone,
      )}
      aria-label={n ? `${n}º lugar` : 'Sem posição'}
    >
      {n ? `${n}º` : '—'}
    </span>
  );
}
