import React from 'react';
import { cn } from '@/lib/utils';

export type CourtSlotStatus =
  | 'available'
  | 'confirmado'
  | 'pendente_pagamento'
  | 'pendente_balcao'
  | 'pendente_confirmacao'
  | 'ocupado'
  | 'past'
  | 'below_min';

export const COURT_SLOT_STATUS_LABELS: Record<CourtSlotStatus, string> = {
  available: '',
  confirmado: 'Confirmado',
  pendente_pagamento: 'Pendente de pagamento',
  pendente_balcao: 'Pendente no balcão',
  pendente_confirmacao: 'Pendente de confirmação',
  ocupado: 'Ocupado',
  past: 'Encerrado',
  below_min: 'Mín. R$ 0,50',
};

const COURT_SLOT_STATUS_STYLES: Record<CourtSlotStatus, string> = {
  available: 'border-gray-300 bg-white text-gray-900 hover:border-primary/40 hover:bg-primary/5',
  confirmado: 'border-green-300 bg-green-50 text-green-800',
  pendente_pagamento: 'border-amber-300 bg-amber-50 text-amber-900',
  pendente_balcao: 'border-amber-300 bg-amber-50 text-amber-900',
  pendente_confirmacao: 'border-yellow-300 bg-yellow-50 text-yellow-900',
  ocupado: 'border-gray-300 bg-gray-100 text-gray-700',
  past: 'border-gray-200 bg-gray-50 text-gray-500 opacity-60',
  below_min: 'border-gray-200 bg-gray-50 text-gray-500 opacity-60',
};

export interface CourtTimeSlotButtonProps {
  timeLabel: string;
  price?: number | null;
  status?: CourtSlotStatus;
  statusLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Slot de horário — botão nativo (evita conflito de estilos do shadcn Button no mobile).
 */
export const CourtTimeSlotButton: React.FC<CourtTimeSlotButtonProps> = ({
  timeLabel,
  price,
  status = 'available',
  statusLabel,
  disabled,
  onClick,
  className,
}) => {
  const isSelectable = status === 'available';
  const isDisabled = disabled ?? !isSelectable;
  const label = statusLabel ?? COURT_SLOT_STATUS_LABELS[status];
  const showPrice = isSelectable && price != null && price > 0;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={isSelectable ? onClick : undefined}
      className={cn(
        'flex min-h-[5rem] w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-4 text-center shadow-none transition-colors',
        'text-base font-medium leading-snug',
        COURT_SLOT_STATUS_STYLES[status],
        isSelectable && 'cursor-pointer active:scale-[0.99]',
        !isSelectable && 'cursor-not-allowed opacity-100',
        isDisabled && !isSelectable && 'opacity-90',
        className,
      )}
    >
      <span className="block w-full text-lg font-bold leading-tight">{timeLabel}</span>
      {showPrice ? (
        <span className="block w-full text-sm font-semibold leading-tight opacity-90">
          R$ {price.toFixed(2).replace('.', ',')}
        </span>
      ) : null}
      {!isSelectable && label ? (
        <span className="block w-full text-sm font-medium leading-tight">{label}</span>
      ) : null}
      {isSelectable && !showPrice ? (
        <span className="block w-full text-sm font-medium leading-tight opacity-80">Livre</span>
      ) : null}
    </button>
  );
};

/** Grade: 1 coluna no celular (legível), depois 2 → 3 → 4 como reserva pública. */
export function CourtTimeSlotGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3', className)}>
      {children}
    </div>
  );
}
