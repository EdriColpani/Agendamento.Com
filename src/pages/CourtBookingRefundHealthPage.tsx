import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { showError } from '@/utils/toast';
import { invokeEdgeWithAuthOrThrow } from '@/utils/edge-invoke';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type RefundSummary = {
  window_hours: number;
  total_cancelled: number;
  refund_approved: number;
  refund_pending_manual: number;
  refund_in_progress: number;
  no_reason_count: number;
};

type ReasonRow = { reason: string; count: number };
type PaymentTypeRow = { payment_type_id: string; count: number };
type AttemptRow = {
  id: string;
  appointment_id: string;
  payment_type_id: string | null;
  payment_method_id: string | null;
  status: string;
  mp_refund_status: string | null;
  error_message: string | null;
  attempted_at: string;
};
type ReconciliationRunRow = {
  id: string;
  status: string;
  scanned_count: number;
  refund_success_count: number;
  manual_required_count: number;
  errors_count: number;
  warning_message: string | null;
  started_at: string;
  duration_ms: number | null;
};

type CompanyOption = { id: string; name: string };

const CourtBookingRefundHealthPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [windowHours, setWindowHours] = useState<24 | 168 | 720>(168);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<RefundSummary | null>(null);
  const [topReasons, setTopReasons] = useState<ReasonRow[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<PaymentTypeRow[]>([]);
  const [latestAttempts, setLatestAttempts] = useState<AttemptRow[]>([]);
  const [latestRuns, setLatestRuns] = useState<ReconciliationRunRow[]>([]);

  const reportCompanyId = useMemo(() => {
    if (isGlobalAdmin) return selectedCompanyId;
    return primaryCompanyId;
  }, [isGlobalAdmin, selectedCompanyId, primaryCompanyId]);

  useEffect(() => {
    if (!isGlobalAdmin || loadingGlobalAdminCheck) return;
    let cancelled = false;
    (async () => {
      setLoadingCompanies(true);
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .order('name', { ascending: true });
        if (error) throw error;
        const list = (data ?? []).map((c) => ({ id: c.id, name: c.name || 'Sem nome' }));
        if (cancelled) return;
        setCompanies(list);
        if (list.length > 0) {
          setSelectedCompanyId((prev) => prev && list.some((x) => x.id === prev) ? prev : list[0].id);
        }
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : 'Erro ao carregar empresas.');
        setCompanies([]);
      } finally {
        if (!cancelled) setLoadingCompanies(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGlobalAdmin, loadingGlobalAdminCheck]);

  const loadData = useCallback(
    async (hours: 24 | 168 | 720 = windowHours) => {
      if (!session?.user || !reportCompanyId) return;
      setLoading(true);
      try {
        const payload = await invokeEdgeWithAuthOrThrow<{
          summary?: RefundSummary;
          top_reasons?: ReasonRow[];
          payment_type_counts?: PaymentTypeRow[];
          latest_attempts?: AttemptRow[];
          latest_reconciliation_runs?: ReconciliationRunRow[];
        }>('get-court-booking-refund-report', {
          body: { window_hours: hours, latest_limit: 25, company_id: reportCompanyId },
        });
        setSummary(payload.summary ?? null);
        setTopReasons(Array.isArray(payload.top_reasons) ? payload.top_reasons : []);
        setPaymentTypes(Array.isArray(payload.payment_type_counts) ? payload.payment_type_counts : []);
        setLatestAttempts(Array.isArray(payload.latest_attempts) ? payload.latest_attempts : []);
        setLatestRuns(Array.isArray(payload.latest_reconciliation_runs) ? payload.latest_reconciliation_runs : []);
      } catch (error: unknown) {
        showError(error instanceof Error ? error.message : 'Erro ao carregar relatório de estornos da arena.');
      } finally {
        setLoading(false);
      }
    },
    [session?.user, reportCompanyId, windowHours],
  );

  useEffect(() => {
    if (session?.user && reportCompanyId) {
      void loadData(windowHours);
    }
  }, [session?.user, reportCompanyId, loadData, windowHours]);

  if (loadingGlobalAdminCheck) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando...</p>
      </div>
    );
  }

  if (isGlobalAdmin) {
    if (loadingCompanies) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-700">Carregando empresas...</p>
        </div>
      );
    }
    if (companies.length === 0) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-gray-700 text-center">Nenhuma empresa cadastrada no sistema.</p>
          <Button className="!rounded-button" onClick={() => navigate('/admin-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao painel
          </Button>
        </div>
      );
    }
  } else {
    if (loadingPrimaryCompany || loadingArenaModule) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-700">Carregando relatório da arena...</p>
        </div>
      );
    }
    if (!canUseArenaManagement) {
      return <Navigate to="/relatorios" replace />;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="!rounded-button cursor-pointer"
            onClick={() => navigate(isGlobalAdmin ? '/admin-dashboard' : '/relatorios')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Saúde Arena — Cancelamentos e Estornos</h1>
        </div>
      </div>

      {isGlobalAdmin && selectedCompanyId && (
        <div className="max-w-md space-y-2">
          <Label htmlFor="refund-company">Empresa</Label>
          <Select value={selectedCompanyId} onValueChange={(v) => setSelectedCompanyId(v)}>
            <SelectTrigger id="refund-company" className="w-full">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">Administrador global: os dados exibidos são filtrados pela empresa selecionada.</p>
        </div>
      )}

      <Card className="border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 text-xl flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-indigo-600" />
              Relatório Operacional
            </CardTitle>
            <p className="text-sm text-gray-700 mt-1">
              Acompanhe cancelamentos, motivos, tentativas de estorno e reconciliação automática.
            </p>
          </div>
          <Button
            variant="outline"
            className="!rounded-button whitespace-nowrap"
            onClick={() => void loadData(windowHours)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={windowHours === 24 ? 'default' : 'outline'} className="!rounded-button" onClick={() => setWindowHours(24)}>
              24h
            </Button>
            <Button type="button" variant={windowHours === 168 ? 'default' : 'outline'} className="!rounded-button" onClick={() => setWindowHours(168)}>
              7 dias
            </Button>
            <Button type="button" variant={windowHours === 720 ? 'default' : 'outline'} className="!rounded-button" onClick={() => setWindowHours(720)}>
              30 dias
            </Button>
            <p className="text-xs text-gray-500 ml-1">Janela: {summary?.window_hours ?? windowHours}h</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Canceladas</p>
              <p className="text-2xl font-semibold">{summary?.total_cancelled ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Estorno OK</p>
              <p className="text-2xl font-semibold text-green-700">{summary?.refund_approved ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Pend. Manual</p>
              <p className="text-2xl font-semibold text-amber-700">{summary?.refund_pending_manual ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Em Progresso</p>
              <p className="text-2xl font-semibold text-blue-700">{summary?.refund_in_progress ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Sem Motivo</p>
              <p className="text-2xl font-semibold text-red-600">{summary?.no_reason_count ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Tentativas</p>
              <p className="text-2xl font-semibold">{latestAttempts.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top motivos de cancelamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-left">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {topReasons.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={2}>
                      Sem dados na janela.
                    </td>
                  </tr>
                ) : (
                  topReasons.map((r) => (
                    <tr key={r.reason} className="border-t">
                      <td className="px-3 py-2">{r.reason}</td>
                      <td className="px-3 py-2">{r.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipos de pagamento nas tentativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {paymentTypes.length === 0 ? (
              <p className="text-sm text-gray-500">Sem tentativas na janela.</p>
            ) : (
              paymentTypes.map((p) => (
                <span key={p.payment_type_id} className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                  {p.payment_type_id}: {p.count}
                </span>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas tentativas de estorno</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Quando</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Método</th>
                  <th className="px-3 py-2 text-left">Resultado MP</th>
                  <th className="px-3 py-2 text-left">Erro</th>
                </tr>
              </thead>
              <tbody>
                {latestAttempts.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={6}>
                      Sem tentativas registradas.
                    </td>
                  </tr>
                ) : (
                  latestAttempts.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="px-3 py-2">{new Date(a.attempted_at).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2">{a.status}</td>
                      <td className="px-3 py-2">{a.payment_type_id || '-'}</td>
                      <td className="px-3 py-2">{a.payment_method_id || '-'}</td>
                      <td className="px-3 py-2">{a.mp_refund_status || '-'}</td>
                      <td className="px-3 py-2 text-red-600">{a.error_message || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execuções de reconciliação automática</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Início</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Lidas</th>
                  <th className="px-3 py-2 text-left">Sucesso</th>
                  <th className="px-3 py-2 text-left">Manual</th>
                  <th className="px-3 py-2 text-left">Erros</th>
                  <th className="px-3 py-2 text-left">Duração</th>
                </tr>
              </thead>
              <tbody>
                {latestRuns.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={7}>
                      Sem execuções registradas.
                    </td>
                  </tr>
                ) : (
                  latestRuns.map((run) => (
                    <tr key={run.id} className="border-t">
                      <td className="px-3 py-2">{new Date(run.started_at).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2">{run.status}</td>
                      <td className="px-3 py-2">{run.scanned_count}</td>
                      <td className="px-3 py-2">{run.refund_success_count}</td>
                      <td className="px-3 py-2">{run.manual_required_count}</td>
                      <td className="px-3 py-2">{run.errors_count}</td>
                      <td className="px-3 py-2">{run.duration_ms != null ? `${run.duration_ms} ms` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CourtBookingRefundHealthPage;
