import { format, parseISO } from 'date-fns';

/** yyyy-MM-dd → dd/MM/yyyy */
export function formatIsoDateToBr(iso: string): string {
  if (!iso || iso.length < 10) return '';
  try {
    return format(parseISO(`${iso.slice(0, 10)}T12:00:00`), 'dd/MM/yyyy');
  } catch {
    return '';
  }
}
