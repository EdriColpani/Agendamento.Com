import React from 'react';
import { cn } from '@/lib/utils';
import { COURT_SLOT_STATUS_LABELS } from './CourtTimeSlotButton';
import { arenaBodyClass } from './arenaPageStyles';

const LEGEND_ITEMS = [
  { key: 'pendente_pagamento' as const, dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-900' },
  { key: 'pendente_balcao' as const, dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-900 border border-amber-200' },
  { key: 'pendente_confirmacao' as const, dot: 'bg-yellow-500', chip: 'bg-yellow-100 text-yellow-900' },
  { key: 'confirmado' as const, dot: 'bg-green-500', chip: 'bg-green-100 text-green-800' },
  { key: 'ocupado' as const, dot: 'bg-gray-500', chip: 'bg-gray-100 text-gray-700' },
];

const CourtSlotStatusLegend: React.FC = () => {
  return (
    <div className={cn('flex flex-wrap gap-2', arenaBodyClass)}>
      {LEGEND_ITEMS.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${item.chip}`}
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.dot}`} />
          {COURT_SLOT_STATUS_LABELS[item.key]}
        </span>
      ))}
    </div>
  );
};

export default CourtSlotStatusLegend;
