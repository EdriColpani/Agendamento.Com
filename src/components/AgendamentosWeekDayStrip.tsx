import React from 'react';
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { arenaToolbarSolidClass } from '@/components/arena/ArenaToolbar';

function weekdayShortLabelPt(day: Date): string {
  const full = format(day, 'EEEE', { locale: ptBR });
  const base = full.replace(/-feira$/i, '').trim();
  return base.toUpperCase();
}

export interface AgendamentosWeekDayStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday?: () => void;
  isCurrentWeek: boolean;
}

/**
 * Faixa horizontal de dias da semana (pílulas) + setas para mudar a semana.
 * Alinhado ao padrão visual arena (dia selecionado em verde com borda branca).
 */
const AgendamentosWeekDayStrip: React.FC<AgendamentosWeekDayStripProps> = ({
  selectedDate,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  isCurrentWeek,
}) => {
  const weekStart = startOfWeek(selectedDate, { locale: ptBR });
  const weekEnd = endOfWeek(selectedDate, { locale: ptBR });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <Card className="border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-950 rounded-xl">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-gray-800 lowercase tracking-tight dark:text-gray-100">
            {format(selectedDate, 'MMMM yyyy', { locale: ptBR })}
          </p>
          {!isCurrentWeek && onToday ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary hover:text-primary"
              onClick={onToday}
            >
              Hoje
            </Button>
          ) : null}
        </div>

        <div className="mt-3 flex items-stretch gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-auto min-h-[4.5rem] shrink-0 self-center rounded-full border-gray-200 dark:border-gray-600"
            onClick={onPrevWeek}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto pb-1 sm:gap-2 sm:justify-center">
            {days.map((day) => {
              const selected = isSameDay(day, selectedDate);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={cn(
                    'flex min-w-[3rem] shrink-0 flex-col items-center justify-center rounded-full px-2 py-2.5 transition-colors sm:min-w-[3.35rem]',
                    selected
                      ? cn('shadow-sm', arenaToolbarSolidClass)
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800',
                  )}
                >
                  <span
                    className={cn(
                      'max-w-[4.25rem] text-center text-[0.58rem] font-semibold uppercase leading-tight tracking-wide sm:text-[0.62rem]',
                      selected ? 'text-primary-foreground' : 'text-muted-foreground dark:text-gray-400',
                    )}
                  >
                    {weekdayShortLabelPt(day)}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 text-base font-bold tabular-nums sm:text-lg',
                      selected ? 'text-primary-foreground' : 'text-gray-900 dark:text-gray-100',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-auto min-h-[4.5rem] shrink-0 self-center rounded-full border-gray-200 dark:border-gray-600"
            onClick={onNextWeek}
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgendamentosWeekDayStrip;
