import { addDays, format, parseISO } from 'date-fns';

/** Janela máxima (dias civis) entre "De" e "Até" na lista de reservas de quadra. */
export const COURT_RESERVATIONS_MAX_RANGE_DAYS = 120;

export const COURT_RESERVATIONS_PAGE_SIZE = 25;

/**
 * Garante from <= to e que o intervalo não ultrapasse maxDays (inclusive).
 * Retorna strings yyyy-MM-dd para uso direto no Supabase.
 */
export function clampCourtReservationDateRange(
  dateFrom: string,
  dateTo: string,
  maxDays: number = COURT_RESERVATIONS_MAX_RANGE_DAYS,
): { effFrom: string; effTo: string; clamped: boolean } {
  let from = parseISO(dateFrom.length > 10 ? dateFrom : `${dateFrom}T12:00:00`);
  let to = parseISO(dateTo.length > 10 ? dateTo : `${dateTo}T12:00:00`);
  if (Number.isNaN(from.getTime())) from = new Date();
  if (Number.isNaN(to.getTime())) to = new Date();
  let swapped = false;
  if (to < from) {
    [from, to] = [to, from];
    swapped = true;
  }
  const maxEnd = addDays(from, maxDays - 1);
  let clamped = swapped;
  if (to > maxEnd) {
    to = maxEnd;
    clamped = true;
  }
  return {
    effFrom: format(from, 'yyyy-MM-dd'),
    effTo: format(to, 'yyyy-MM-dd'),
    clamped,
  };
}
