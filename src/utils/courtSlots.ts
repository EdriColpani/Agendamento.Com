import { addMinutes, format, parse } from 'date-fns';

/** Intervalo em minutos desde 00:00 do dia (0–1440). */
export type MinuteInterval = { startMin: number; endMin: number };

export interface WorkingHourRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface SlotDisplay {
  /** HH:mm para exibição e chave */
  startTime: string;
  /** minutos desde meia-noite (início do slot) */
  startMin: number;
  occupied: boolean;
}

/** Aceita HH:mm ou HH:mm:ss; fim do dia exclusivo pode usar 24:00:00 → 1440 min. */
export function timeStrToMinutes(t: string): number {
  const parts = t.split(':').map((p) => parseInt(p, 10));
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  if (h >= 24) return 24 * 60;
  return h * 60 + m + Math.floor(s / 60);
}

/** Faixa de preço retornada pelo RPC get_court_public_day_view (mesmo dia da semana da data). */
export interface CourtPriceBand {
  start_time: string;
  end_time: string;
  slot_price: number;
  sort_order?: number;
}

/**
 * Preço exibido para um slot cujo início é startTime (HH:mm), usando faixas [start,end) em minutos.
 * Preserve a ordem do array (deve ser a mesma do SQL: sort_order, depois start_time).
 */
export function resolveSlotPriceFromBands(
  startTimeHHmm: string,
  bands: CourtPriceBand[],
  defaultSlotPrice: number,
): number {
  if (!bands?.length) return defaultSlotPrice;
  const startMin = timeStrToMinutes(startTimeHHmm.length <= 5 ? `${startTimeHHmm}:00` : startTimeHHmm);
  for (const b of bands) {
    const a = timeStrToMinutes(b.start_time);
    const z = timeStrToMinutes(b.end_time);
    if (startMin >= a && startMin < z) {
      return Number(b.slot_price);
    }
  }
  return defaultSlotPrice;
}

function minutesToHHmm(totalMin: number): string {
  const m = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mi = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/**
 * Espelha a lógica de compute_court_booking_total_price no cliente (reservas no mesmo dia civil).
 */
export function estimateCourtBookingTotalPrice(
  startTimeHHmm: string,
  durationMinutes: number,
  slotDurationMinutes: number,
  bands: CourtPriceBand[],
  defaultSlotPrice: number,
): number {
  const slotMin = slotDurationMinutes > 0 ? slotDurationMinutes : 60;
  let total = 0;
  let cur =
    timeStrToMinutes(startTimeHHmm.length <= 5 ? `${startTimeHHmm}:00` : startTimeHHmm);
  const endMin = cur + durationMinutes;
  while (cur < endMin) {
    total += resolveSlotPriceFromBands(minutesToHHmm(cur), bands, defaultSlotPrice);
    cur += slotMin;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Gera slots de início (cada `slotMinutes`) dentro da janela [start_time, end_time).
 * O último slot começa de forma que start + slotMinutes <= end_time (em minutos do dia).
 */
export function buildCourtDaySlots(
  workingStart: string,
  workingEnd: string,
  slotMinutes: number,
): MinuteInterval[] {
  const open = timeStrToMinutes(workingStart);
  const close = timeStrToMinutes(workingEnd);
  if (close <= open || slotMinutes <= 0) return [];

  const slots: MinuteInterval[] = [];
  for (let s = open; s + slotMinutes <= close; s += slotMinutes) {
    slots.push({ startMin: s, endMin: s + slotMinutes });
  }
  return slots;
}

function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

/**
 * Converte agendamentos do dia (hora + duração) em intervalos absolutos do mesmo dia civil.
 */
export function appointmentsToOccupiedIntervals(
  rows: { appointment_time: string; total_duration_minutes: number | null }[],
): MinuteInterval[] {
  const out: MinuteInterval[] = [];
  for (const row of rows) {
    const startMin = timeStrToMinutes(row.appointment_time);
    const dur = row.total_duration_minutes ?? 60;
    out.push({ startMin, endMin: startMin + dur });
  }
  return out;
}

/**
 * Marca cada slot como ocupado se intersecta qualquer intervalo ocupado.
 */
export function mergeSlotsWithOccupancy(
  slotStarts: MinuteInterval[],
  occupied: MinuteInterval[],
): SlotDisplay[] {
  return slotStarts.map(({ startMin, endMin }) => {
    const occupiedBlock = occupied.some((o) => intervalsOverlap({ startMin, endMin }, o));
    const d = new Date(0, 0, 0, 0, 0, 0, 0);
    const t = addMinutes(d, startMin);
    return {
      startTime: format(t, 'HH:mm'),
      startMin,
      occupied: occupiedBlock,
    };
  });
}

/**
 * Utilitário completo: a partir da janela do dia e ocupação, retorna slots para UI.
 */
export function computeCourtSlotsForDay(
  workingStart: string,
  workingEnd: string,
  slotMinutes: number,
  appointments: { appointment_time: string; total_duration_minutes: number | null }[],
): SlotDisplay[] {
  const raw = buildCourtDaySlots(workingStart, workingEnd, slotMinutes);
  const occ = appointmentsToOccupiedIntervals(appointments);
  return mergeSlotsWithOccupancy(raw, occ);
}
