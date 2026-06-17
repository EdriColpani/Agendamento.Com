import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatIsoDateToBr } from '@/utils/brDateInput';

export interface BrDatePickerProps {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  fromDate?: Date;
  toDate?: Date;
}

/** Seletor de data com calendário — exibe DD/MM/AAAA; valor em yyyy-MM-dd. */
const BrDatePicker: React.FC<BrDatePickerProps> = ({
  id,
  value,
  onChange,
  className,
  disabled,
  placeholder = 'Selecione a data',
  fromDate,
  toDate,
}) => {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (!value || value.length < 10) return undefined;
    try {
      return parseISO(`${value.slice(0, 10)}T12:00:00`);
    } catch {
      return undefined;
    }
  }, [value]);

  const displayLabel = selected ? formatIsoDateToBr(value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start gap-2 text-left font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
          locale={ptBR}
          disabled={(date) => {
            if (fromDate && date < fromDate) return true;
            if (toDate && date > toDate) return true;
            return false;
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
};

export default BrDatePicker;
