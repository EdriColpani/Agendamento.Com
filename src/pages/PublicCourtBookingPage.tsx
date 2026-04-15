import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO, startOfDay, isBefore, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { findOrCreateClient } from '@/services/appointmentService';
import {
  createCourtBookingPublic,
  getCourtPublicDayView,
  listPublicCourtsForBooking,
  type PublicCourtRow,
} from '@/services/courtBookingService';
import {
  computeCourtSlotsForDay,
  estimateCourtBookingTotalPrice,
  type CourtPriceBand,
} from '@/utils/courtSlots';
import { Loader2 } from 'lucide-react';

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatPhoneBR(value: string) {
  const digits = onlyDigits(value).slice(0, 13);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 9);
    const part2 = digits.slice(9, 13);
    return `+${ddi} (${ddd}) ${part1}-${part2}`;
  }
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (digits.length < 3) return `(${digits}`;
  if (digits.length <= 10) {
    const part1 = rest.slice(0, 4);
    const part2 = rest.slice(4, 8);
    return `(${ddd})${part2 ? ` ${part1}-${part2}` : ` ${part1}`}`.trim();
  }
  const part1 = rest.slice(0, 5);
  const part2 = rest.slice(5, 9);
  return `(${ddd}) ${part1}-${part2}`;
}

function parseEdgeInvokeError(response: {
  error?: { message?: string; context?: { data?: unknown } };
  data?: unknown;
}): string {
  if (response.error) {
    const ctx = response.error.context?.data;
    if (typeof ctx === 'string') {
      try {
        const parsed = JSON.parse(ctx) as { error?: string };
        return parsed.error || response.error.message || 'Erro na Edge Function.';
      } catch {
        return ctx || response.error.message || 'Erro na Edge Function.';
      }
    }
    if (ctx && typeof ctx === 'object' && ctx !== null && 'error' in ctx) {
      return String((ctx as { error?: string }).error || response.error.message || 'Erro na Edge Function.');
    }
    return response.error.message || 'Erro na Edge Function.';
  }
  if (response.data && typeof response.data === 'object' && response.data !== null && 'error' in response.data) {
    return String((response.data as { error?: string }).error || 'Erro na Edge Function.');
  }
  return 'Erro na Edge Function.';
}

const PublicCourtBookingPage: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaMessage, setMetaMessage] = useState<string | null>(null);
  const [courts, setCourts] = useState<PublicCourtRow[]>([]);
  const [courtId, setCourtId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [slots, setSlots] = useState<{ startTime: string; occupied: boolean; slotPrice: number }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [slotToBook, setSlotToBook] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingObservations, setBookingObservations] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [slotPriceDisplay, setSlotPriceDisplay] = useState(0);
  const [dayPriceBands, setDayPriceBands] = useState<CourtPriceBand[]>([]);
  const [dayDefaultPrice, setDayDefaultPrice] = useState(0);

  const dateStr = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const isSelectedDateToday = useMemo(() => isSameDay(selectedDate, new Date()), [selectedDate]);

  const loadCourts = useCallback(async () => {
    if (!companyId) return;
    setLoadingMeta(true);
    setMetaMessage(null);
    try {
      const { data: comp, error: compErr } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle();
      if (!compErr && comp?.name) setCompanyName(comp.name);
      else setCompanyName(null);

      const res = await listPublicCourtsForBooking(companyId);
      if (!res.ok) {
        setCourts([]);
        setMetaMessage(res.message || 'Reserva pública não disponível.');
        return;
      }

      const { data: mpReady, error: mpReadyErr } = await supabase.rpc('company_public_court_mercadopago_ready', {
        p_company_id: companyId,
      });
      if (mpReadyErr || mpReady !== true) {
        setCourts([]);
        setMetaMessage(
          mpReadyErr?.message ||
            'Reserva pelo link exige pagamento online (Mercado Pago). Esta empresa ainda não está configurada para receber por aqui — fale com a arena.',
        );
        return;
      }

      setCourts(res.courts);
      setCourtId((prev) => {
        if (prev && res.courts.some((r) => r.id === prev)) return prev;
        return res.courts[0]?.id ?? '';
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(msg);
      setMetaMessage(msg);
      setCourts([]);
    } finally {
      setLoadingMeta(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  const refreshSlots = useCallback(async () => {
    if (!companyId || !courtId) {
      setSlots([]);
      setDayPriceBands([]);
      setDayDefaultPrice(0);
      return;
    }
    setLoadingSlots(true);
    try {
      const view = await getCourtPublicDayView(companyId, courtId, dateStr);
      if (!view.ok) {
        setSlots([]);
        setDayPriceBands([]);
        setDayDefaultPrice(0);
        if (view.message) setMetaMessage(view.message);
        return;
      }
      setMetaMessage(null);
      if (!view.day_open || !view.working_start || !view.working_end) {
        setSlots([]);
        const bandsClosed = (view.price_bands || []) as CourtPriceBand[];
        setDayPriceBands(bandsClosed);
        setDayDefaultPrice(Number(view.default_slot_price ?? 0));
        return;
      }
      const startShort = view.working_start.substring(0, 5);
      const endShort = view.working_end.substring(0, 5);
      const dur = view.slot_duration_minutes ?? 60;
      const occ = view.occupancy || [];
      const bands = (view.price_bands || []) as CourtPriceBand[];
      const def = Number(view.default_slot_price ?? 0);
      setDayPriceBands(bands);
      setDayDefaultPrice(def);
      const computed = computeCourtSlotsForDay(startShort, endShort, dur, occ);
      setSlots(
        computed.map((s) => ({
          startTime: s.startTime,
          occupied: s.occupied,
          slotPrice: estimateCourtBookingTotalPrice(s.startTime, dur, dur, bands, def),
        })),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(msg);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [companyId, courtId, dateStr]);

  useEffect(() => {
    refreshSlots();
  }, [refreshSlots]);

  const openBookModal = (startTime: string) => {
    const c = courts.find((x) => x.id === courtId);
    const dur = c?.slot_duration_minutes ?? 60;
    setSlotPriceDisplay(estimateCourtBookingTotalPrice(startTime, dur, dur, dayPriceBands, dayDefaultPrice));
    setSlotToBook(startTime);
    setGuestName('');
    setGuestPhone('');
    setBookingObservations('');
    setBookModalOpen(true);
  };

  const isPastSlot = (startTime: string) => {
    if (!isSelectedDateToday) return false;
    const [hh, mm] = startTime.split(':').map(Number);
    const slotDate = new Date(selectedDate);
    slotDate.setHours(hh, mm, 0, 0);
    return slotDate <= new Date();
  };

  const handleConfirmBooking = async () => {
    if (!companyId || !courtId || !slotToBook) return;
    const digits = onlyDigits(guestPhone);
    if (digits.length !== 10 && digits.length !== 11 && digits.length !== 13) {
      showError('Informe um telefone válido (DDD + número).');
      return;
    }
    if (!guestName.trim()) {
      showError('Informe seu nome.');
      return;
    }
    if (slotPriceDisplay < 0.5) {
      showError('Este horário não atinge o valor mínimo (R$ 0,50) para pagamento online.');
      return;
    }
    setBookingSubmitting(true);
    try {
      const { clientId, clientNickname } = await findOrCreateClient(companyId, guestName.trim(), guestPhone);
      const newId = await createCourtBookingPublic({
        companyId,
        courtId,
        clientId,
        clientNickname,
        appointmentDate: dateStr,
        appointmentTime: slotToBook,
        durationMinutes: courts.find((c) => c.id === courtId)?.slot_duration_minutes ?? 60,
        observations: bookingObservations.trim() || null,
      });

      const checkoutRes = await supabase.functions.invoke('create-court-booking-checkout', {
        body: JSON.stringify({ appointment_id: newId }),
      });
      if (checkoutRes.error || (checkoutRes.data && typeof checkoutRes.data === 'object' && 'error' in checkoutRes.data)) {
        throw new Error(parseEdgeInvokeError(checkoutRes));
      }
      const payload = checkoutRes.data as { init_point?: string };
      if (!payload?.init_point) {
        throw new Error('Não foi possível abrir o checkout do Mercado Pago.');
      }
      setBookModalOpen(false);
      setSlotToBook(null);
      await refreshSlots();
      window.location.href = payload.init_point;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError(msg);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    const today = startOfDay(new Date());
    if (date && isBefore(date, today)) {
      showError('Não é possível reservar em datas passadas.');
      return;
    }
    if (date) setSelectedDate(date);
  };

  if (!companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-gray-600">Empresa não informada na URL.</p>
      </div>
    );
  }

  if (loadingMeta) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-600" />
        <p className="ml-2 text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (metaMessage && courts.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-lg mt-10">
        <Card>
          <CardHeader>
            <CardTitle>Reserva de quadras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700">{metaMessage}</p>
            <Button variant="outline" asChild>
              <Link to="/">Voltar ao início</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-3xl mt-4 md:mt-8 pb-16">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 text-center">
        Reservar quadra
      </h1>
      {companyName ? (
        <p className="text-center text-gray-600 mb-6">{companyName}</p>
      ) : (
        <p className="text-center text-sm text-gray-500 mb-6">Empresa {companyId.slice(0, 8)}…</p>
      )}

      <p className="text-sm text-center text-gray-700 mb-6 max-w-xl mx-auto bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        Pelo link público a reserva é <strong>só com pagamento online</strong> (Mercado Pago: PIX, cartão e outros meios
        oferecidos pelo checkout). A vaga fica pendente até o pagamento ser aprovado; o valor mínimo é{' '}
        <strong>R$ 0,50</strong>.
      </p>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label>Quadra</Label>
            <Select value={courtId} onValueChange={setCourtId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {courts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.has_price_bands
                      ? ' — preço por horário'
                      : Number(c.default_slot_price) > 0
                        ? ` — R$ ${Number(c.default_slot_price).toFixed(2).replace('.', ',')} / slot`
                        : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Data</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              locale={ptBR}
              disabled={(d) => isBefore(d, startOfDay(new Date()))}
              className="rounded-md border mx-auto"
            />
            <p className="text-sm text-center text-gray-600 mt-2">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Horários disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSlots ? (
            <p className="text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando grade…
            </p>
          ) : slots.length === 0 ? (
            <p className="text-gray-600">Sem horários para esta data ou quadra fechada.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {slots.map((s) => (
                (() => {
                  const past = isPastSlot(s.startTime);
                  const belowMin = !s.occupied && !past && s.slotPrice < 0.5;
                  const disabled = s.occupied || past || belowMin;
                  const statusLabel = s.occupied
                    ? 'Ocupado'
                    : past
                      ? 'Encerrado'
                      : belowMin
                        ? 'Mín. R$ 0,50'
                        : 'Livre';
                  return (
                <Button
                  key={s.startTime}
                  type="button"
                  variant={disabled ? 'secondary' : 'outline'}
                  disabled={disabled}
                  className={
                    disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'border-amber-400 hover:bg-amber-50 text-gray-900'
                  }
                  onClick={() => !disabled && openBookModal(s.startTime)}
                >
                  <span className="block font-medium">{s.startTime}</span>
                  {!disabled && s.slotPrice > 0 ? (
                    <span className="block text-xs font-normal opacity-90">
                      R$ {s.slotPrice.toFixed(2).replace('.', ',')}
                    </span>
                  ) : null}
                  <span className="block text-[11px] font-normal opacity-80">{statusLabel}</span>
                </Button>
                  );
                })()
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-500 mt-6 text-center">
        Ao reservar, seus dados serão usados para identificar o agendamento na arena.
      </p>

      <Dialog open={bookModalOpen} onOpenChange={setBookModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar reserva</DialogTitle>
            <DialogDescription>
              {slotToBook && dateStr ? (
                <>
                  {format(parseISO(dateStr), 'dd/MM/yyyy')} às {slotToBook}
                  {(slotPriceDisplay > 0 || dayPriceBands.length > 0) && (
                    <span className="block mt-1 font-medium text-gray-800">
                      {slotPriceDisplay > 0
                        ? `Valor estimado: R$ ${slotPriceDisplay.toFixed(2).replace('.', ',')}`
                        : 'Sem cobrança neste horário (faixa R$ 0 ou padrão).'}
                    </span>
                  )}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="guest-name">Nome *</Label>
              <Input
                id="guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1"
                placeholder="Seu nome"
              />
            </div>
            <div>
              <Label htmlFor="guest-phone">Telefone *</Label>
              <Input
                id="guest-phone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(formatPhoneBR(e.target.value))}
                className="mt-1"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label htmlFor="guest-obs">Observações</Label>
              <Textarea
                id="guest-obs"
                value={bookingObservations}
                onChange={(e) => setBookingObservations(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <p className="text-sm text-gray-600 rounded-md border bg-muted/40 px-3 py-2">
              Ao confirmar, abriremos o <strong>checkout do Mercado Pago</strong>. Lá você pode pagar com as opções
              disponíveis na sua conta (ex.: PIX ou cartão). A reserva só é confirmada no sistema após a aprovação do
              pagamento.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBookModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-yellow-600 hover:bg-yellow-700 text-black"
              disabled={bookingSubmitting}
              onClick={handleConfirmBooking}
            >
              {bookingSubmitting ? 'Abrindo pagamento…' : 'Confirmar e pagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicCourtBookingPage;
