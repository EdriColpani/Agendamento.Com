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
import { showError } from '@/utils/toast';
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

  const courtNameById = useMemo(() => {
    const m = new Map<string, string>();
    courts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [courts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / COURT_RESERVATIONS_PAGE_SIZE));
  const clampMeta = useMemo(() => clampCourtReservationDateRange(dateFrom, dateTo), [dateFrom, dateTo]);

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
                      <TableHead className="w-[100px]" />
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
                            <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                              <Link
                                to={`/agendamentos/edit/${r.id}`}
                                title="Editar reserva"
                                aria-label="Editar reserva"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
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
