import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Estados visuais padronizados dos slots de quadra (agenda interna + link público). */
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
  ocupado: 'border-gray-300 bg-gray-100 text-gray-600',
  past: 'border-gray-200 bg-gray-50 text-gray-500 opacity-60',
  below_min: 'border-gray-200 bg-gray-50 text-gray-500 opacity-60',
};

export interface CourtTimeSlotButtonProps {
  /** Ex.: "09:00" ou "09:00 às 09:30" */
  timeLabel: string;
  price?: number | null;
  status?: CourtSlotStatus;
  /** Sobrescreve o rótulo padrão do status */
  statusLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Botão de horário padronizado para grade de quadras.
 * Estrutura fixa em todas as telas: horário (sm) → preço ou status (xs).
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
    <Button
      type="button"
      variant={isSelectable ? 'outline' : 'secondary'}
      disabled={isDisabled}
      onClick={isSelectable ? onClick : undefined}
      className={cn(
        'h-auto min-h-[4rem] w-full flex-col items-center justify-center gap-1 rounded-md border py-2.5 px-2 text-center whitespace-normal shadow-none',
        COURT_SLOT_STATUS_STYLES[status],
        isSelectable && 'cursor-pointer',
        !isSelectable && 'cursor-not-allowed opacity-100',
        className,
      )}
    >
      <span className="text-sm font-semibold leading-tight">{timeLabel}</span>
      {showPrice ? (
        <span className="text-xs font-normal leading-tight text-gray-600">
          R$ {price.toFixed(2).replace('.', ',')}
        </span>
      ) : null}
      {!isSelectable && label ? (
        <span className="text-xs font-medium leading-tight">{label}</span>
      ) : null}
      {isSelectable && !showPrice ? (
        <span className="text-xs font-normal leading-tight text-gray-500">Livre</span>
      ) : null}
    </Button>
  );
};

export function CourtTimeSlotGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2', className)}>{children}</div>;
}
