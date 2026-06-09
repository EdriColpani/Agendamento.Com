import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showOperationError, sanitizeErrorMessage } from '@/utils/toast';
import { createCourtBooking } from '@/services/courtBookingService';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import {
  computeCourtSlotsForDay,
  estimateCourtBookingTotalPrice,
  type CourtPriceBand,
} from '@/utils/courtSlots';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import ArenaToolbar from '@/components/arena/ArenaToolbar';
import { getArenaModuleLinks } from '@/components/arena/arenaNavConfig';

interface CourtOption {
  id: string;
  name: string;
  description?: string | null;
  slot_duration_minutes: number;
  default_slot_price?: number | null;
  image_url?: string | null;
  zip_code?: string | null;
  address?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  city?: string | null;
  state?: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

type SlotBlockKind =
  | 'confirmado'
  | 'pendente_pagamento'
  | 'pendente_balcao'
  | 'pendente_confirmacao'
  | 'ocupado'
  | null;

interface CourtAgendaAppointment {
  appointment_time: string;
  total_duration_minutes: number | null;
  status: string | null;
  payment_method?: string | null;
  mp_payment_status?: string | null;
}

interface CourtAgendaSlot {
  startTime: string;
  occupied: boolean;
  slotPrice: number;
  blockKind: SlotBlockKind;
  blockLabel: string;
}

const SLOT_BLOCK_LABELS: Record<Exclude<SlotBlockKind, null>, string> = {
  confirmado: 'Confirmado',
  pendente_pagamento: 'Pendente de pagamento',
  pendente_balcao: 'Pendente no balcão',
  pendente_confirmacao: 'Pendente de confirmação',
  ocupado: 'Ocupado',
};

function isPendingBlockKind(kind: SlotBlockKind): boolean {
  return (
    kind === 'pendente_pagamento' ||
    kind === 'pendente_balcao' ||
    kind === 'pendente_confirmacao'
  );
}

const SLOT_BLOCK_SHORT_LABELS: Partial<Record<Exclude<SlotBlockKind, null>, string>> = {
  pendente_pagamento: 'Pend. pagamento',
  pendente_balcao: 'Pend. balcão',
  pendente_confirmacao: 'Pend. confirmação',
};

function getSlotBlockShortLabel(kind: SlotBlockKind, fullLabel: string): string {
  if (!kind) return fullLabel;
  return SLOT_BLOCK_SHORT_LABELS[kind] ?? fullLabel;
}

function CourtAgendaLegend({ compact }: { compact?: boolean }) {
  const items = [
    { className: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', label: 'Pendente de pagamento', short: 'Pend. pagamento' },
    { className: 'bg-amber-50 text-amber-900 border border-amber-200', dot: 'bg-amber-400', label: 'Pendente no balcão', short: 'Pend. balcão' },
    { className: 'bg-yellow-100 text-yellow-900', dot: 'bg-yellow-500', label: 'Pendente de confirmação', short: 'Pend. confirmação' },
    { className: 'bg-green-100 text-green-800', dot: 'bg-green-500', label: 'Confirmado', short: 'Confirmado' },
    { className: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500', label: 'Outro bloqueio', short: 'Ocupado' },
  ];

  if (compact) {
    return (
      <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <summary className="cursor-pointer font-medium text-gray-900 select-none">Legenda dos horários</summary>
        <div className="mt-2 grid grid-cols-1 gap-1.5">
          {items.map((item) => (
            <span key={item.label} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ${item.className}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
              {item.short}
            </span>
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
      {items.map((item) => (
        <span key={item.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${item.className}`}>
          <span className={`h-2 w-2 rounded-full ${item.dot}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function getPendingBlockKind(appt: CourtAgendaAppointment): Exclude<SlotBlockKind, null | 'confirmado' | 'ocupado'> {
  const payment = String(appt.payment_method || '').toLowerCase();
  if (payment === 'mercado_pago') {
    const mpStatus = String(appt.mp_payment_status || '').toLowerCase();
    if (mpStatus === 'approved') return 'pendente_confirmacao';
    return 'pendente_pagamento';
  }
  if (payment === 'dinheiro') return 'pendente_balcao';
  return 'pendente_confirmacao';
}

function resolveSlotBlock(
  slotStartTime: string,
  slotMinutes: number,
  appointments: CourtAgendaAppointment[],
): { kind: SlotBlockKind; label: string } {
  const toMinutes = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map((n) => Number(n));
    return h * 60 + m;
  };
  const slotStart = toMinutes(slotStartTime);
  const slotEnd = slotStart + slotMinutes;

  const overlapping = (appointments || []).filter((appt) => {
    const start = toMinutes(appt.appointment_time);
    const end = start + (appt.total_duration_minutes ?? 60);
    return start < slotEnd && end > slotStart;
  });

  if (overlapping.length === 0) {
    return { kind: null, label: '' };
  }

  if (overlapping.some((appt) => String(appt.status || '').toLowerCase() === 'confirmado')) {
    return { kind: 'confirmado', label: SLOT_BLOCK_LABELS.confirmado };
  }

  const pendingAppt = overlapping.find((appt) => String(appt.status || '').toLowerCase() === 'pendente');
  if (pendingAppt) {
    const kind = getPendingBlockKind(pendingAppt);
    return { kind, label: SLOT_BLOCK_LABELS[kind] };
  }

  return { kind: 'ocupado', label: SLOT_BLOCK_LABELS.ocupado };
}

interface CourtAgendaData {
  workingStart: string | null;
  workingEnd: string | null;
  slotMinutes: number;
  slots: CourtAgendaSlot[];
  error: string | null;
}

interface BookingContext {
  courtId: string;
  courtName: string;
  startTime: string;
  slotMinutes: number;
  slotPrice: number;
}

function formatCourtAddress(court: CourtOption): string {
  const firstLine = [court.address, court.number, court.neighborhood]
    .filter((item) => item && String(item).trim())
    .join(', ');
  const secondLine = [court.city, court.state, court.zip_code]
    .filter((item) => item && String(item).trim())
    .join(' - ');
  const full = [firstLine, secondLine].filter(Boolean).join(' · ');
  return full || 'Endereço não informado';
}

const CourtAgendaPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [dateWindowStart, setDateWindowStart] = useState<Date>(() => startOfDay(new Date()));
  const [courtAgendas, setCourtAgendas] = useState<Record<string, CourtAgendaData>>({});
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookingContext, setBookingContext] = useState<BookingContext | null>(null);
  const [bookingClientId, setBookingClientId] = useState('');
  const [bookingInitialStatus, setBookingInitialStatus] = useState<'pendente' | 'confirmado'>('pendente');
  const [bookingObservations, setBookingObservations] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const dateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayOfWeek = selectedDate.getDay();
  const visibleDates = useMemo(
    () => Array.from({ length: 10 }, (_, idx) => addDays(dateWindowStart, idx)),
    [dateWindowStart],
  );

  const loadCourts = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('courts')
      .select(
        'id, name, description, slot_duration_minutes, default_slot_price, image_url, zip_code, address, number, neighborhood, complement, city, state',
      )
      .eq('company_id', primaryCompanyId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) {
      showOperationError('Erro ao carregar quadras.', error);
      setCourts([]);
      return;
    }
    setCourts((data as CourtOption[]) || []);
  }, [primaryCompanyId]);

  const loadClients = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .eq('company_id', primaryCompanyId)
      .order('name', { ascending: true });
    if (error) {
      showOperationError('Erro ao carregar clientes.', error);
      setClients([]);
      return;
    }
    setClients((data as ClientOption[]) || []);
  }, [primaryCompanyId]);

  const refreshAgenda = useCallback(async () => {
    if (!primaryCompanyId || courts.length === 0) {
      setCourtAgendas({});
      return;
    }
    setLoadingAgenda(true);
    const nextAgendas: Record<string, CourtAgendaData> = {};
    await Promise.all(
      courts.map(async (court) => {
        try {
          const dur = court.slot_duration_minutes ?? 60;
          const defPrice = Number(court.default_slot_price ?? 0);

          const { data: bandData, error: bandErr } = await supabase
            .from('court_slot_price_bands')
            .select('start_time, end_time, slot_price')
            .eq('court_id', court.id)
            .eq('day_of_week', dayOfWeek)
            .order('sort_order', { ascending: true })
            .order('start_time', { ascending: true });
          if (bandErr) throw bandErr;
          const bands = (bandData || []) as CourtPriceBand[];

          const { data: whRows, error: whErr } = await supabase
            .from('court_working_hours')
            .select('start_time, end_time, is_active')
            .eq('court_id', court.id)
            .eq('day_of_week', dayOfWeek)
            .maybeSingle();
          if (whErr) throw whErr;

          if (!whRows || whRows.is_active === false) {
            nextAgendas[court.id] = {
              workingStart: null,
              workingEnd: null,
              slotMinutes: dur,
              slots: [],
              error: null,
            };
            return;
          }

          const st = String(whRows.start_time);
          const en = String(whRows.end_time);

          const { data: appts, error: apErr } = await supabase
            .from('appointments')
            .select('appointment_time, total_duration_minutes, status, payment_method, mp_payment_status')
            .eq('company_id', primaryCompanyId)
            .eq('court_id', court.id)
            .eq('appointment_date', dateStr)
            .or('status.is.null,status.not.in.(cancelado,concluido)');
          if (apErr) throw apErr;

          const computed = computeCourtSlotsForDay(st, en, dur, appts || []);
          const now = new Date();
          const isToday = isSameDay(startOfDay(selectedDate), startOfDay(now));
          const visibleSlots = isToday
            ? computed.filter((slot) => {
                const [h, m] = slot.startTime.split(':').map((x) => parseInt(x, 10));
                const slotStart = new Date(
                  selectedDate.getFullYear(),
                  selectedDate.getMonth(),
                  selectedDate.getDate(),
                  h,
                  m,
                  0,
                  0,
                );
                return slotStart.getTime() >= now.getTime();
              })
            : computed;

          nextAgendas[court.id] = {
            workingStart: st,
            workingEnd: en,
            slotMinutes: dur,
            slots: visibleSlots.map((slot) => {
              const block = slot.occupied
                ? resolveSlotBlock(slot.startTime, dur, (appts || []) as CourtAgendaAppointment[])
                : { kind: null as SlotBlockKind, label: '' };
              return {
                startTime: slot.startTime,
                occupied: slot.occupied,
                slotPrice: estimateCourtBookingTotalPrice(slot.startTime, dur, dur, bands, defPrice),
                blockKind: block.kind,
                blockLabel: block.label,
              };
            }),
            error: null,
          };
        } catch (e: unknown) {
          const msg = sanitizeErrorMessage(
            e instanceof Error ? e.message : String(e),
            'Não foi possível carregar a agenda da quadra.',
          );
          nextAgendas[court.id] = {
            workingStart: null,
            workingEnd: null,
            slotMinutes: court.slot_duration_minutes ?? 60,
            slots: [],
            error: msg,
          };
        }
      }),
    );
    setCourtAgendas(nextAgendas);
    setLoadingAgenda(false);
  }, [primaryCompanyId, courts, dayOfWeek, dateStr, selectedDate]);

  useEffect(() => {
    if (primaryCompanyId && isCourtMode && canUseArenaManagement) {
      loadCourts();
      loadClients();
    }
  }, [primaryCompanyId, isCourtMode, canUseArenaManagement, loadCourts, loadClients]);

  useEffect(() => {
    refreshAgenda();
  }, [refreshAgenda]);

  if (loadingPrimaryCompany || loadingSchedulingMode || loadingArenaModule) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700 dark:text-gray-300">Carregando...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 mb-4">É necessário ter uma empresa primária.</p>
        <Button onClick={() => navigate('/register-company')}>Cadastrar empresa</Button>
      </div>
    );
  }

  if (!isCourtMode) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!canUseArenaManagement) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Módulo de quadras indisponível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <p>O módulo de quadras não está habilitado para o seu plano ou foi desativado na empresa.</p>
            <Button className="!rounded-button" variant="outline" onClick={() => navigate('/dashboard')}>
              Voltar ao dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openBookModal = (court: CourtOption, slot: CourtAgendaSlot, slotMinutes: number) => {
    setBookingContext({
      courtId: court.id,
      courtName: court.name,
      startTime: slot.startTime,
      slotMinutes,
      slotPrice: slot.slotPrice,
    });
    setBookingClientId('');
    setBookingInitialStatus('pendente');
    setBookingObservations('');
    setBookModalOpen(true);
  };

  const handleConfirmBooking = async () => {
    if (!primaryCompanyId || !bookingContext) return;
    if (!bookingClientId) {
      showError('Selecione um cliente.');
      return;
    }
    const client = clients.find((c) => c.id === bookingClientId);
    setBookingSubmitting(true);
    try {
      const createdId = await createCourtBooking({
        companyId: primaryCompanyId,
        courtId: bookingContext.courtId,
        clientId: bookingClientId,
        clientNickname: client?.name ?? null,
        appointmentDate: dateStr,
        appointmentTime: bookingContext.startTime,
        durationMinutes: bookingContext.slotMinutes,
        observations: bookingObservations.trim() || null,
      });

      if (bookingInitialStatus === 'confirmado') {
        const { error: statusError } = await supabase
          .from('appointments')
          .update({ status: 'confirmado', payment_method: 'dinheiro' })
          .eq('id', createdId)
          .eq('company_id', primaryCompanyId);
        if (statusError) throw statusError;
      }

      showSuccess(
        bookingInitialStatus === 'confirmado'
          ? 'Reserva criada e confirmada com sucesso.'
          : 'Reserva criada com sucesso (pendente).',
      );
      setBookModalOpen(false);
      setBookingContext(null);
      await refreshAgenda();
    } catch (e: unknown) {
      showOperationError('Não foi possível criar a reserva.', e);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const hasAnySlots = courts.some((court) => (courtAgendas[court.id]?.slots.length ?? 0) > 0);

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden sm:space-y-6">
      <ArenaPageHeader
        title="Agenda das quadras"
        actions={
          <ArenaToolbar
            back={{ to: '/quadras', label: 'Quadras' }}
            links={getArenaModuleLinks(true)}
          />
        }
      />

      {courts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600 dark:text-gray-400">Cadastre quadras e configure os horários.</p>
            <Button className="mt-4 rounded-full" asChild>
              <Link to="/quadras">Ir para Quadras</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2 px-4 pt-4 sm:px-6 sm:pt-6">
              <CardTitle className="text-base sm:text-lg text-center capitalize">
                {format(selectedDate, "MMMM yyyy", { locale: ptBR })}
              </CardTitle>
              <p className="text-center text-sm text-muted-foreground">
                {format(selectedDate, "EEEE, dd/MM/yyyy", { locale: ptBR })}
              </p>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="!rounded-button"
                  onClick={() => {
                    const prevStart = addDays(dateWindowStart, -7);
                    setDateWindowStart(prevStart);
                    if (selectedDate < prevStart) setSelectedDate(prevStart);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 overflow-x-auto">
                  <div className="flex gap-2 min-w-max pb-1">
                    {visibleDates.map((date) => {
                      const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
                      return (
                        <Button
                          key={format(date, 'yyyy-MM-dd')}
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedDate(date)}
                          className="min-h-[auto] min-w-[56px] sm:min-w-[72px] flex-col gap-0 rounded-full px-2 sm:px-3 py-2 font-normal shrink-0"
                        >
                          <span className="block text-xs uppercase leading-tight">
                            {format(date, 'EEE', { locale: ptBR })}
                          </span>
                          <span className="block text-sm font-semibold leading-tight">
                            {format(date, 'dd')}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="!rounded-button"
                  onClick={() => setDateWindowStart(addDays(dateWindowStart, 7))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {hasAnySlots ? (
            <>
              <div className="sm:hidden">
                <CourtAgendaLegend compact />
              </div>
              <div className="hidden sm:block">
                <CourtAgendaLegend />
              </div>
            </>
          ) : null}

          <div className="space-y-3 sm:space-y-4">
            {courts.map((court) => {
              const agenda = courtAgendas[court.id];
              return (
                <Card key={court.id}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col md:flex-row gap-3 sm:gap-4">
                      <div className="hidden sm:block md:w-36 h-24 rounded-md overflow-hidden border bg-gray-100 shrink-0">
                        {court.image_url ? (
                          <img src={court.image_url} alt={court.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                            Sem imagem
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-3">
                        <div>
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{court.name}</h3>
                          {court.description ? (
                            <p className="text-sm font-medium text-orange-600">{court.description}</p>
                          ) : null}
                          <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 sm:line-clamp-none">
                            {formatCourtAddress(court)}
                          </p>
                        </div>

                        {loadingAgenda && !agenda ? (
                          <p className="text-sm text-gray-600">Carregando horários...</p>
                        ) : agenda?.error ? (
                          <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>Falha ao carregar</AlertTitle>
                            <AlertDescription>{agenda.error}</AlertDescription>
                          </Alert>
                        ) : !agenda?.workingStart || !agenda?.workingEnd ? (
                          <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>Sem horário neste dia</AlertTitle>
                            <AlertDescription>
                              Não há janela de funcionamento cadastrada para este dia da semana nesta quadra.
                            </AlertDescription>
                          </Alert>
                        ) : agenda.slots.length === 0 ? (
                          <p className="text-sm text-gray-600">
                            Nenhum slot gerado para este dia com blocos de {agenda.slotMinutes} minutos.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-wrap">
                              {agenda.slots.map((slot) => {
                              const end = addDays(new Date(`1970-01-01T${slot.startTime}:00`), 0);
                              end.setMinutes(end.getMinutes() + agenda.slotMinutes);
                              const endStr = format(end, 'HH:mm');
                              const occupiedClass =
                                slot.blockKind === 'confirmado'
                                  ? 'cursor-not-allowed border-green-300 bg-green-50 text-green-800'
                                  : slot.blockKind === 'pendente_balcao'
                                    ? 'cursor-not-allowed border-amber-200 bg-amber-50/80 text-amber-900'
                                    : isPendingBlockKind(slot.blockKind)
                                      ? 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-800'
                                      : 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-500';
                              return (
                                <button
                                  key={`${court.id}-${slot.startTime}`}
                                  type="button"
                                  disabled={slot.occupied}
                                  onClick={() => !slot.occupied && openBookModal(court, slot, agenda.slotMinutes)}
                                  className={`w-full rounded-md border px-2.5 py-2 text-left lg:w-auto lg:min-w-[132px] lg:max-w-[160px] ${
                                    slot.occupied ? occupiedClass : 'border-gray-300 bg-white text-gray-900 hover:border-gray-500'
                                  }`}
                                >
                                  <span className="block text-xs sm:text-sm font-medium leading-tight">
                                    {slot.startTime} às {endStr}
                                  </span>
                                  <span className="block text-[11px] sm:text-sm font-semibold leading-snug mt-0.5">
                                    {slot.occupied ? (
                                      <>
                                        <span className="sm:hidden">
                                          {getSlotBlockShortLabel(slot.blockKind, slot.blockLabel)}
                                        </span>
                                        <span className="hidden sm:inline">{slot.blockLabel}</span>
                                      </>
                                    ) : (
                                      `R$ ${slot.slotPrice.toFixed(2).replace('.', ',')}`
                                    )}
                                  </span>
                                </button>
                              );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={bookModalOpen} onOpenChange={setBookModalOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova reserva de quadra</DialogTitle>
            <DialogDescription>
              {bookingContext ? (
                <>
                  {bookingContext.courtName} · {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às{' '}
                  {bookingContext.startTime} — duração {bookingContext.slotMinutes} min.
                  {bookingContext.slotPrice > 0 && (
                    <span className="block mt-1 font-medium text-foreground">
                      Valor estimado: R$ {bookingContext.slotPrice.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Cliente *</Label>
              <Select value={bookingClientId} onValueChange={setBookingClientId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Cadastre clientes em Clientes.</p>
              ) : null}
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={bookingObservations}
                onChange={(e) => setBookingObservations(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div>
              <Label>Status inicial da reserva</Label>
              <Select
                value={bookingInitialStatus}
                onValueChange={(v: 'pendente' | 'confirmado') => setBookingInitialStatus(v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente (aguardando confirmação)</SelectItem>
                  <SelectItem value="confirmado">Confirmado (telefone/balcão)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Use confirmado quando o cliente ligar ou reservar direto no balcão da arena.
              </p>
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setBookModalOpen(false)}
              disabled={bookingSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={bookingSubmitting || !bookingClientId}
              onClick={handleConfirmBooking}
            >
              {bookingSubmitting ? 'Salvando...' : 'Confirmar reserva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourtAgendaPage;
