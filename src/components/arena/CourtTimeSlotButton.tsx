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
 * Slot de horário — compacto no celular, confortável no desktop.
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
        'flex min-h-[3.25rem] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1.5 py-2 text-center shadow-none transition-colors',
        'sm:min-h-[3.75rem] sm:gap-1 sm:rounded-lg sm:px-2.5 sm:py-2.5',
        'md:min-h-[4rem] md:px-3',
        COURT_SLOT_STATUS_STYLES[status],
        isSelectable && 'cursor-pointer active:scale-[0.99]',
        !isSelectable && 'cursor-not-allowed opacity-100',
        isDisabled && !isSelectable && 'opacity-90',
        className,
      )}
    >
      <span className="block w-full text-xs font-bold leading-tight sm:text-sm md:text-base">{timeLabel}</span>
      {showPrice ? (
        <span className="block w-full text-[11px] font-semibold leading-tight opacity-90 sm:text-xs md:text-sm">
          R$ {price.toFixed(2).replace('.', ',')}
        </span>
      ) : null}
      {!isSelectable && label ? (
        <span className="block w-full text-[10px] font-medium leading-tight sm:text-xs">{label}</span>
      ) : null}
      {isSelectable && !showPrice ? (
        <span className="block w-full text-[11px] font-medium leading-tight opacity-80 sm:text-xs">Livre</span>
      ) : null}
    </button>
  );
};

export type CourtTimeSlotGridLayout = 'admin' | 'public';

/** Grade de horários — 2 colunas no celular; densidade maior no desktop. */
export function CourtTimeSlotGrid({
  children,
  className,
  layout = 'admin',
}: {
  children: React.ReactNode;
  className?: string;
  layout?: CourtTimeSlotGridLayout;
}) {
  const layoutClass =
    layout === 'public'
      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-2.5 md:gap-3'
      : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5 md:gap-3';

  return <div className={cn(layoutClass, className)}>{children}</div>;
}
