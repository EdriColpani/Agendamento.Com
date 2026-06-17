import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  activeCourtSportNames,
  courtSportRequiresSelection,
  type CourtSportModality,
} from '@/utils/courtSportModalities';

export interface CourtSportSelectProps {
  modalities: CourtSportModality[] | string[] | null | undefined;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  label?: string;
  required?: boolean;
}

/**
 * Exibe select de esporte somente quando a quadra tem 2+ modalidades.
 * Com 0 modalidades: não renderiza. Com 1: não renderiza (valor auto no pai).
 */
const CourtSportSelect: React.FC<CourtSportSelectProps> = ({
  modalities,
  value,
  onChange,
  className,
  triggerClassName,
  label = 'Modalidade / esporte',
  required,
}) => {
  const names = activeCourtSportNames(modalities);
  if (!courtSportRequiresSelection(modalities)) return null;

  return (
    <div className={cn('space-y-1', className)}>
      <Label>
        {label}
        {required !== false ? ' *' : ''}
      </Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className={cn('mt-1', triggerClassName)}>
          <SelectValue placeholder="Selecione o esporte" />
        </SelectTrigger>
        <SelectContent>
          {names.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default CourtSportSelect;
