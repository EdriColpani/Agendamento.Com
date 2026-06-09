import React from 'react';
import { COURT_SLOT_STATUS_LABELS } from './CourtTimeSlotButton';

const LEGEND_ITEMS = [
  { key: 'pendente_pagamento' as const, dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-900' },
  { key: 'pendente_balcao' as const, dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-900 border border-amber-200' },
  { key: 'pendente_confirmacao' as const, dot: 'bg-yellow-500', chip: 'bg-yellow-100 text-yellow-900' },
  { key: 'confirmado' as const, dot: 'bg-green-500', chip: 'bg-green-100 text-green-800' },
  { key: 'ocupado' as const, dot: 'bg-gray-500', chip: 'bg-gray-100 text-gray-700' },
];

/**
 * Legenda única para grades de horário da arena (mesma apresentação em mobile e desktop).
 */
const CourtSlotStatusLegend: React.FC = () => {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-gray-700">
      {LEGEND_ITEMS.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${item.chip}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
          {COURT_SLOT_STATUS_LABELS[item.key]}
        </span>
      ))}
    </div>
  );
};

export default CourtSlotStatusLegend;
