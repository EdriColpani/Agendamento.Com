import { supabase } from '@/integrations/supabase/client';

export interface CreateCourtBookingParams {
  companyId: string;
  courtId: string;
  clientId: string;
  clientNickname?: string | null;
  appointmentDate: string;
  /** HH:mm ou HH:mm:ss */
  appointmentTime: string;
  durationMinutes: number;
  observations?: string | null;
  paymentMethod?: 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'mercado_pago' | null;
}

function normalizeTime(t: string): string {
  const trimmed = t.trim();
  if (trimmed.length === 5) return `${trimmed}:00`;
  return trimmed;
}

/**
 * Cria reserva de quadra via RPC (conflito validado no banco).
 * @returns id do agendamento
 */
export async function createCourtBooking(params: CreateCourtBookingParams): Promise<string> {
  const { data, error } = await supabase.rpc('create_court_booking', {
    p_company_id: params.companyId,
    p_court_id: params.courtId,
    p_client_id: params.clientId,
    p_client_nickname: params.clientNickname ?? null,
    p_appointment_date: params.appointmentDate,
    p_appointment_time: normalizeTime(params.appointmentTime),
    p_duration_minutes: params.durationMinutes,
    p_observations: params.observations ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Erro ao criar reserva da quadra.');
  }
  if (!data) {
    throw new Error('Resposta vazia ao criar reserva.');
  }
  return String(data);
}

export interface PublicCourtRow {
  id: string;
  name: string;
  slot_duration_minutes: number;
  default_slot_price: number;
  /** true se existem faixas em court_slot_price_bands (preço varia por horário). */
  has_price_bands?: boolean;
}

export async function listPublicCourtsForBooking(companyId: string): Promise<{
  ok: boolean;
  message?: string;
  courts: PublicCourtRow[];
}> {
  const { data, error } = await supabase.rpc('list_public_courts_for_booking', {
    p_company_id: companyId,
  });
  if (error) {
    throw new Error(error.message || 'Erro ao carregar quadras.');
  }
  const raw = data as { ok?: boolean; message?: string; courts?: PublicCourtRow[] };
  if (!raw?.ok) {
    return { ok: false, message: raw?.message || 'Indisponível.', courts: [] };
  }
  return { ok: true, courts: Array.isArray(raw.courts) ? raw.courts : [] };
}

export interface CourtPublicDayPriceBand {
  start_time: string;
  end_time: string;
  slot_price: number;
}

export interface CourtPublicDayView {
  ok: boolean;
  message?: string;
  court_name?: string;
  slot_duration_minutes?: number;
  default_slot_price?: number;
  /** Faixas do dia da semana da data pedida; vazio = só default_slot_price. */
  price_bands?: CourtPublicDayPriceBand[];
  day_open?: boolean;
  working_start?: string | null;
  working_end?: string | null;
  occupancy?: { appointment_time: string; total_duration_minutes: number | null }[];
}

export async function getCourtPublicDayView(
  companyId: string,
  courtId: string,
  appointmentDate: string,
): Promise<CourtPublicDayView> {
  const { data, error } = await supabase.rpc('get_court_public_day_view', {
    p_company_id: companyId,
    p_court_id: courtId,
    p_date: appointmentDate,
  });
  if (error) {
    throw new Error(error.message || 'Erro ao carregar agenda do dia.');
  }
  return data as CourtPublicDayView;
}

/**
 * Reserva pública (sem login). O cliente deve existir na empresa (ex.: findOrCreateClient).
 */
export async function createCourtBookingPublic(params: CreateCourtBookingParams): Promise<string> {
  const { data, error } = await supabase.rpc('create_court_booking_public', {
    p_company_id: params.companyId,
    p_court_id: params.courtId,
    p_client_id: params.clientId,
    p_client_nickname: params.clientNickname ?? null,
    p_appointment_date: params.appointmentDate,
    p_appointment_time: normalizeTime(params.appointmentTime),
    p_duration_minutes: params.durationMinutes,
    p_observations: params.observations ?? null,
    /** Reserva pública: servidor exige sempre Mercado Pago (migration 20260428). */
    p_payment_method: 'mercado_pago',
  });

  if (error) {
    throw new Error(error.message || 'Erro ao criar reserva.');
  }
  if (!data) {
    throw new Error('Resposta vazia ao criar reserva.');
  }
  return String(data);
}
