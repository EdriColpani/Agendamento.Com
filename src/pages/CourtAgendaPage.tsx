import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
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
import { Calendar } from '@/components/ui/calendar';
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
import { showError, showSuccess } from '@/utils/toast';
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
import { ArrowLeft, Info } from 'lucide-react';

interface CourtOption {
  id: string;
  name: string;
  slot_duration_minutes: number;
}

interface ClientOption {
  id: string;
  name: string;
}

const CourtAgendaPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [courtId, setCourtId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [workingStart, setWorkingStart] = useState<string | null>(null);
  const [workingEnd, setWorkingEnd] = useState<string | null>(null);
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [slots, setSlots] = useState<{ startTime: string; occupied: boolean; slotPrice: number }[]>([]);
  const [agendaPriceBands, setAgendaPriceBands] = useState<CourtPriceBand[]>([]);
  const [agendaDefaultPrice, setAgendaDefaultPrice] = useState(0);
  const [bookingTotalHint, setBookingTotalHint] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [slotToBook, setSlotToBook] = useState<string | null>(null);
  const [bookingClientId, setBookingClientId] = useState('');
  const [bookingObservations, setBookingObservations] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const dateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayOfWeek = selectedDate.getDay();

  const loadCourts = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('courts')
      .select('id, name, slot_duration_minutes')
      .eq('company_id', primaryCompanyId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) {
      showError('Erro ao carregar quadras: ' + error.message);
      setCourts([]);
      return;
    }
    const rows = (data as CourtOption[]) || [];
    setCourts(rows);
    setCourtId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      return rows[0]?.id ?? '';
    });
  }, [primaryCompanyId]);

  const loadClients = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .eq('company_id', primaryCompanyId)
      .order('name', { ascending: true });
    if (error) {
      showError('Erro ao carregar clientes: ' + error.message);
      setClients([]);
      return;
    }
    setClients((data as ClientOption[]) || []);
  }, [primaryCompanyId]);

  const refreshAgenda = useCallback(async () => {
    if (!primaryCompanyId || !courtId) {
      setSlots([]);
      setWorkingStart(null);
      setWorkingEnd(null);
      setAgendaPriceBands([]);
      setAgendaDefaultPrice(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: courtRow } = await supabase
        .from('courts')
        .select('slot_duration_minutes, default_slot_price')
        .eq('id', courtId)
        .maybeSingle();
      const dur = courtRow?.slot_duration_minutes ?? 60;
      const defPrice = Number(courtRow?.default_slot_price ?? 0);
      setSlotMinutes(dur);
      setAgendaDefaultPrice(defPrice);

      const { data: bandData, error: bandErr } = await supabase
        .from('court_slot_price_bands')
        .select('start_time, end_time, slot_price')
        .eq('court_id', courtId)
        .eq('day_of_week', dayOfWeek)
        .order('sort_order', { ascending: true })
        .order('start_time', { ascending: true });
      if (bandErr) throw bandErr;
      const bands = (bandData || []) as CourtPriceBand[];
      setAgendaPriceBands(bands);

      const { data: whRows, error: whErr } = await supabase
        .from('court_working_hours')
        .select('start_time, end_time, is_active')
        .eq('court_id', courtId)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();

      if (whErr) throw whErr;

      if (!whRows || whRows.is_active === false) {
        setWorkingStart(null);
        setWorkingEnd(null);
        setSlots([]);
        setLoading(false);
        return;
      }

      const st = whRows.start_time as string;
      const en = whRows.end_time as string;
      setWorkingStart(st);
      setWorkingEnd(en);

      const { data: appts, error: apErr } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration_minutes, status, booking_kind, court_id')
        .eq('company_id', primaryCompanyId)
        .eq('court_id', courtId)
        .eq('appointment_date', dateStr)
        .neq('status', 'cancelado');

      if (apErr) throw apErr;

      const rows = appts || [];

      const computed = computeCourtSlotsForDay(st, en, dur, rows);
      setSlots(
        computed.map((s) => ({
          startTime: s.startTime,
          occupied: s.occupied,
          slotPrice: estimateCourtBookingTotalPrice(s.startTime, dur, dur, bands, defPrice),
        })),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao montar agenda: ' + msg);
      setSlots([]);
      setAgendaPriceBands([]);
      setAgendaDefaultPrice(0);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId, courtId, dateStr, dayOfWeek]);

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

  const openBookModal = (startTime: string) => {
    setSlotToBook(startTime);
    setBookingClientId('');
    setBookingObservations('');
    setBookModalOpen(true);
  };

  const handleConfirmBooking = async () => {
    if (!primaryCompanyId || !courtId || !slotToBook) return;
    if (!bookingClientId) {
      showError('Selecione um cliente.');
      return;
    }
    const client = clients.find((c) => c.id === bookingClientId);
    setBookingSubmitting(true);
    try {
      const newAppointmentId = await createCourtBooking({
        companyId: primaryCompanyId,
        courtId,
        clientId: bookingClientId,
        clientNickname: client?.name ?? null,
        appointmentDate: dateStr,
        appointmentTime: slotToBook,
        durationMinutes: slotMinutes,
        observations: bookingObservations.trim() || null,
      });
      showSuccess('Reserva criada com sucesso.');
      setBookModalOpen(false);
      setSlotToBook(null);
      await refreshAgenda();
      navigate(`/agendamentos/edit/${newAppointmentId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(msg);
    } finally {
      setBookingSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" className="!rounded-button" asChild>
          <Link to="/quadras">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quadras
          </Link>
        </Button>
        <Button variant="outline" className="!rounded-button" asChild>
          <Link to="/quadras/horarios">Horários de funcionamento</Link>
        </Button>
        <Button variant="outline" className="!rounded-button" asChild>
          <Link to="/quadras/precos">Preços por horário</Link>
        </Button>
        <Button variant="outline" className="!rounded-button" asChild>
          <Link to="/quadras/reservas">Lista de reservas</Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agenda das quadras</h1>

      {courts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600 dark:text-gray-400">Cadastre quadras e configure os horários.</p>
            <Button className="mt-4" asChild>
              <Link to="/quadras">Ir para Quadras</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ptBR}
                className="rounded-md border"
              />
              <p className="text-sm text-muted-foreground mt-3">
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grade de horários</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md">
                <Label>Quadra</Label>
                <Select value={courtId} onValueChange={setCourtId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} — slots de {c.slot_duration_minutes ?? 60} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!workingStart || !workingEnd ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Sem horário neste dia</AlertTitle>
                  <AlertDescription>
                    Não há janela de funcionamento cadastrada para este dia da semana nesta quadra.
                    Configure em Horários de funcionamento.
                  </AlertDescription>
                </Alert>
              ) : loading ? (
                <p className="text-gray-600">Carregando...</p>
              ) : slots.length === 0 ? (
                <p className="text-gray-600">
                  Nenhum slot gerado (verifique se o intervalo permite ao menos um bloco de {slotMinutes}{' '}
                  minutos).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.startTime}
                      type="button"
                      disabled={s.occupied}
                      onClick={() => !s.occupied && openBookModal(s.startTime)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        s.occupied
                          ? 'cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          : 'cursor-pointer border-emerald-300 bg-emerald-50 text-emerald-900 hover:opacity-90 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
                      }`}
                    >
                      <span className="font-medium">{s.startTime}</span>
                      {!s.occupied && s.slotPrice > 0 ? (
                        <span className="block text-xs opacity-90">R$ {s.slotPrice.toFixed(2).replace('.', ',')}</span>
                      ) : null}
                      <span className="block text-xs opacity-80">{s.occupied ? 'Ocupado' : 'Livre'}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={bookModalOpen} onOpenChange={setBookModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova reserva de quadra</DialogTitle>
            <DialogDescription>
              {slotToBook && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às {slotToBook} — duração{' '}
              {slotMinutes} min.
              {bookingTotalHint !== null && bookingTotalHint > 0 && (
                <span className="block mt-1 font-medium text-foreground">
                  Valor estimado: R$ {bookingTotalHint.toFixed(2).replace('.', ',')}
                </span>
              )}
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
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Cadastre clientes em Clientes.</p>
              )}
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBookModalOpen(false)} disabled={bookingSubmitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-yellow-600 hover:bg-yellow-700 text-black"
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
