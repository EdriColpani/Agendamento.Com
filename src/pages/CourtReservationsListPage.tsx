import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { format, subDays, addDays } from 'date-fns';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { invokeEdgeWithAuthOrThrow } from '@/utils/edge-invoke';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import { getStatusColor } from '@/lib/dashboard-utils';
import {
  clampCourtReservationDateRange,
  COURT_RESERVATIONS_MAX_RANGE_DAYS,
  COURT_RESERVATIONS_PAGE_SIZE,
} from '@/utils/courtReservationListQuery';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import ArenaToolbar from '@/components/arena/ArenaToolbar';
import { getArenaModuleLinks } from '@/components/arena/arenaNavConfig';

interface CourtOption {
  id: string;
  name: string;
}

interface CourtReservationRow {
  id: string;
  appointment_date: string;
  appointment_time: string;
  total_duration_minutes: number | null;
  total_price: number | null;
  status: string | null;
  client_nickname: string | null;
  court_id: string | null;
  courts: { name: string } | null;
  clients: { name: string } | null;
}

interface ReservationSummaryRow {
  status: string | null;
  court_id: string | null;
  courts: { name: string } | null;
}

function displayClientName(row: CourtReservationRow): string {
  return row.client_nickname?.trim() || row.clients?.name?.trim() || '—';
}

function formatTime(t: string): string {
  if (!t) return '—';
  return t.length > 5 ? t.slice(0, 5) : t;
}

const CourtReservationsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);

  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [courtFilter, setCourtFilter] = useState<string>('all');
  const [statusScope, setStatusScope] = useState<string>('ativas');
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(addDays(new Date(), 60), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<CourtReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRows, setSummaryRows] = useState<ReservationSummaryRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadCourts = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('courts')
      .select('id, name')
      .eq('company_id', primaryCompanyId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      showError('Erro ao carregar quadras: ' + error.message);
      setCourts([]);
      return;
    }
    setCourts((data as CourtOption[]) || []);
  }, [primaryCompanyId]);

  const fetchReservations = useCallback(async () => {
    if (!primaryCompanyId) return;
    setLoading(true);
    try {
      const { effFrom, effTo, clamped } = clampCourtReservationDateRange(dateFrom, dateTo);
      if (clamped) {
        toast.message(
          `Período limitado a ${COURT_RESERVATIONS_MAX_RANGE_DAYS} dias corridos (início/fim ajustados para esta consulta).`,
        );
      }

      const fromIdx = (page - 1) * COURT_RESERVATIONS_PAGE_SIZE;
      const toIdx = fromIdx + COURT_RESERVATIONS_PAGE_SIZE - 1;

      let q = supabase
        .from('appointments')
        .select(
          `
          id,
          appointment_date,
          appointment_time,
          total_duration_minutes,
          total_price,
          status,
          client_nickname,
          court_id,
          courts(name),
          clients(name)
        `,
          { count: 'exact' },
        )
        .eq('company_id', primaryCompanyId)
        .eq('booking_kind', 'court')
        .gte('appointment_date', effFrom)
        .lte('appointment_date', effTo)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })
        .order('id', { ascending: false })
        .range(fromIdx, toIdx);

      if (courtFilter !== 'all') {
        q = q.eq('court_id', courtFilter);
      }
      if (statusScope === 'ativas') {
        q = q.neq('status', 'cancelado');
      } else if (statusScope !== 'todas' && statusScope) {
        q = q.eq('status', statusScope);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data as CourtReservationRow[]) || []);
      setTotalCount(typeof count === 'number' ? count : 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao carregar reservas: ' + msg);
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId, courtFilter, statusScope, dateFrom, dateTo, page]);

  const fetchSummary = useCallback(async () => {
    if (!primaryCompanyId) return;
    setSummaryLoading(true);
    try {
      const { effFrom, effTo } = clampCourtReservationDateRange(dateFrom, dateTo);
      let q = supabase
        .from('appointments')
        .select('status, court_id, courts(name)')
        .eq('company_id', primaryCompanyId)
        .eq('booking_kind', 'court')
        .gte('appointment_date', effFrom)
        .lte('appointment_date', effTo);

      if (courtFilter !== 'all') {
        q = q.eq('court_id', courtFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      setSummaryRows((data as ReservationSummaryRow[]) || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao carregar resumo operacional: ' + msg);
      setSummaryRows([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [primaryCompanyId, courtFilter, dateFrom, dateTo]);

  const handleFinalizeReservation = useCallback(
    async (row: CourtReservationRow) => {
      if (!primaryCompanyId || !session?.user) return;
      if (row.status !== 'confirmado') {
        showError('Só é possível finalizar reservas com status confirmado.');
        return;
      }

      const ok = window.confirm(
        'Finalizar esta reserva? O status será concluído e será lançada a movimentação de recebimento no caixa.',
      );
      if (!ok) return;

      setFinishingId(row.id);
      try {
        await invokeEdgeWithAuthOrThrow('finalize-court-reservation', {
          body: { appointmentId: row.id },
        });
        showSuccess('Reserva finalizada com sucesso.');
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'concluido' } : r)));
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        showError(`Erro ao finalizar reserva: ${msg}`);
      } finally {
        setFinishingId(null);
      }
    },
    [primaryCompanyId, session?.user],
  );

  const handleQuickStatusChange = useCallback(
    async (row: CourtReservationRow, targetStatus: 'confirmado' | 'cancelado') => {
      if (!primaryCompanyId) return;
      const currentStatus = String(row.status || '');

      if (targetStatus === 'confirmado' && currentStatus !== 'pendente') {
        showError('Só é possível confirmar reservas pendentes.');
        return;
      }
      if (targetStatus === 'cancelado' && currentStatus !== 'pendente') {
        showError('Cancelamento rápido disponível apenas para reservas pendentes.');
        return;
      }

      const promptText =
        targetStatus === 'confirmado'
          ? 'Confirmar esta reserva pendente?'
          : 'Cancelar esta reserva pendente?';
      if (!window.confirm(promptText)) return;

      setStatusUpdatingId(row.id);
      try {
        const payload: Record<string, unknown> =
          targetStatus === 'cancelado'
            ? {
                status: 'cancelado',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: 'Cancelado rapidamente no menu Reservas.',
              }
            : { status: 'confirmado' };

        const { error } = await supabase
          .from('appointments')
          .update(payload)
          .eq('id', row.id)
          .eq('company_id', primaryCompanyId)
          .eq('status', 'pendente');
        if (error) throw error;

        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: targetStatus } : r)));
        showSuccess(
          targetStatus === 'confirmado'
            ? 'Reserva confirmada com sucesso.'
            : 'Reserva cancelada com sucesso.',
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        showError(`Erro ao atualizar status da reserva: ${msg}`);
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [primaryCompanyId],
  );

  useEffect(() => {
    if (primaryCompanyId && isCourtMode && canUseArenaManagement) {
      loadCourts();
    }
  }, [primaryCompanyId, isCourtMode, canUseArenaManagement, loadCourts]);

  useEffect(() => {
    if (primaryCompanyId && isCourtMode && canUseArenaManagement) {
      fetchReservations();
    }
  }, [primaryCompanyId, isCourtMode, canUseArenaManagement, fetchReservations]);

  useEffect(() => {
    if (primaryCompanyId && isCourtMode && canUseArenaManagement) {
      fetchSummary();
    }
  }, [primaryCompanyId, isCourtMode, canUseArenaManagement, fetchSummary]);

  const courtNameById = useMemo(() => {
    const m = new Map<string, string>();
    courts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [courts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / COURT_RESERVATIONS_PAGE_SIZE));
  const clampMeta = useMemo(() => clampCourtReservationDateRange(dateFrom, dateTo), [dateFrom, dateTo]);
  const summaryMetrics = useMemo(() => {
    const metrics = {
      pendente: 0,
      confirmado: 0,
      concluido: 0,
      cancelado: 0,
      outros: 0,
    };
    const perCourt = new Map<string, { courtName: string; pendente: number; confirmado: number; concluido: number }>();

    for (const row of summaryRows) {
      const status = String(row.status || '').toLowerCase();
      if (status === 'pendente') metrics.pendente += 1;
      else if (status === 'confirmado') metrics.confirmado += 1;
      else if (status === 'concluido') metrics.concluido += 1;
      else if (status === 'cancelado') metrics.cancelado += 1;
      else metrics.outros += 1;

      const courtKey = row.court_id || 'sem-quadra';
      const courtName = row.courts?.name || 'Sem quadra';
      if (!perCourt.has(courtKey)) {
        perCourt.set(courtKey, { courtName, pendente: 0, confirmado: 0, concluido: 0 });
      }
      const bucket = perCourt.get(courtKey)!;
      if (status === 'pendente') bucket.pendente += 1;
      if (status === 'confirmado') bucket.confirmado += 1;
      if (status === 'concluido') bucket.concluido += 1;
    }

    const nonCanceled = metrics.pendente + metrics.confirmado + metrics.concluido + metrics.outros;
    const conversionRate = nonCanceled > 0 ? ((metrics.confirmado + metrics.concluido) / nonCanceled) * 100 : 0;
    return {
      ...metrics,
      conversionRate,
      perCourt: Array.from(perCourt.values()).sort((a, b) => a.courtName.localeCompare(b.courtName)),
    };
  }, [summaryRows]);

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
            <p>O módulo de quadras não está habilitado para esta empresa.</p>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Voltar ao dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ArenaPageHeader
        title="Reservas por quadra"
        actions={<ArenaToolbar back={{ to: '/quadras', label: 'Quadras' }} links={getArenaModuleLinks(true)} />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-gray-900 dark:text-white">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Consulta limitada a <strong>{COURT_RESERVATIONS_MAX_RANGE_DAYS} dias</strong> corridos entre &quot;De&quot; e
            &quot;Até&quot;. Resultados em páginas de <strong>{COURT_RESERVATIONS_PAGE_SIZE}</strong> linhas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div>
              <Label>Quadra</Label>
              <Select
                value={courtFilter}
                onValueChange={(v) => {
                  setCourtFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as quadras</SelectItem>
                  {courts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={statusScope}
                onValueChange={(v) => {
                  setStatusScope(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativas">Ativas (exceto cancelado)</SelectItem>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cr-from">De</Label>
              <Input
                id="cr-from"
                type="date"
                className="mt-1"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <Label htmlFor="cr-to">Até</Label>
              <Input
                id="cr-to"
                type="date"
                className="mt-1"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="!rounded-button"
              onClick={() => fetchReservations()}
              disabled={loading}
            >
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base text-gray-900 dark:text-white">Resumo operacional</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="!rounded-button"
            onClick={() => fetchSummary()}
            disabled={summaryLoading}
          >
            {summaryLoading ? 'Atualizando...' : 'Atualizar resumo'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <button
              type="button"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left"
              onClick={() => {
                setStatusScope('pendente');
                setPage(1);
              }}
            >
              <p className="text-xs text-amber-800">Pendente</p>
              <p className="text-xl font-semibold text-amber-900">{summaryMetrics.pendente}</p>
            </button>
            <button
              type="button"
              className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-left"
              onClick={() => {
                setStatusScope('confirmado');
                setPage(1);
              }}
            >
              <p className="text-xs text-green-800">Confirmado</p>
              <p className="text-xl font-semibold text-green-900">{summaryMetrics.confirmado}</p>
            </button>
            <button
              type="button"
              className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-left"
              onClick={() => {
                setStatusScope('concluido');
                setPage(1);
              }}
            >
              <p className="text-xs text-blue-800">Concluído</p>
              <p className="text-xl font-semibold text-blue-900">{summaryMetrics.concluido}</p>
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-left"
              onClick={() => {
                setStatusScope('cancelado');
                setPage(1);
              }}
            >
              <p className="text-xs text-gray-700">Cancelado</p>
              <p className="text-xl font-semibold text-gray-900">{summaryMetrics.cancelado}</p>
            </button>
            <div className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-left">
              <p className="text-xs text-indigo-800">Taxa de conversão</p>
              <p className="text-xl font-semibold text-indigo-900">
                {summaryMetrics.conversionRate.toFixed(1).replace('.', ',')}%
              </p>
            </div>
          </div>

          {courtFilter === 'all' && summaryMetrics.perCourt.length > 0 ? (
            <div className="rounded-md border border-border p-3">
              <p className="text-sm font-medium mb-2">Distribuição por quadra</p>
              <div className="space-y-1 text-sm">
                {summaryMetrics.perCourt.map((row) => (
                  <div key={row.courtName} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{row.courtName}</span>
                    <span className="text-muted-foreground">
                      P: {row.pendente} · C: {row.confirmado} · F: {row.concluido}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base text-gray-900 dark:text-white">Lista</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {totalCount} registro(s) · período efetivo {clampMeta.effFrom} a {clampMeta.effTo}
            </p>
          </div>
          <Button variant="outline" size="sm" className="!rounded-button" asChild>
            <Link to="/quadras/agenda">Ver grade do dia</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500">Carregando reservas...</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">Nenhuma reserva encontrada com os filtros atuais.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Quadra</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[220px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const courtLabel =
                        r.courts?.name || (r.court_id ? courtNameById.get(r.court_id) : null) || '—';
                      const price = r.total_price != null ? Number(r.total_price) : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{format(new Date(r.appointment_date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{formatTime(String(r.appointment_time))}</TableCell>
                          <TableCell>{courtLabel}</TableCell>
                          <TableCell>{displayClientName(r)}</TableCell>
                          <TableCell>{r.total_duration_minutes ?? 60} min</TableCell>
                          <TableCell>
                            {price > 0 ? `R$ ${price.toFixed(2).replace('.', ',')}` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getStatusColor(r.status || '')} text-white text-xs`}>
                              {r.status || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                                <Link
                                  to={`/agendamentos/edit/${r.id}`}
                                  title="Editar reserva"
                                  aria-label="Editar reserva"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8"
                                disabled={statusUpdatingId === r.id || r.status !== 'pendente'}
                                onClick={() => void handleQuickStatusChange(r, 'confirmado')}
                              >
                                {statusUpdatingId === r.id ? 'Atualizando...' : 'Confirmar'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="h-8"
                                disabled={statusUpdatingId === r.id || r.status !== 'pendente'}
                                onClick={() => void handleQuickStatusChange(r, 'cancelado')}
                              >
                                {statusUpdatingId === r.id ? 'Atualizando...' : 'Cancelar'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={finishingId === r.id || r.status !== 'confirmado'}
                                onClick={() => void handleFinalizeReservation(r)}
                              >
                                {finishingId === r.id ? 'Finalizando...' : 'Finalizar'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalCount > COURT_RESERVATIONS_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading || page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading || page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CourtReservationsListPage;
