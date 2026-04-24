import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ArrowLeft, BarChart3, Download, RefreshCcw } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeWithAuth, parseEdgeInvokeError } from '@/utils/edge-invoke';
import { showError, showSuccess } from '@/utils/toast';

type SubscriptionChangeStatus = 'pending_payment' | 'scheduled' | 'applied' | 'failed' | 'cancelled';

interface SubscriptionChangeReport {
  company_id: string;
  period_days: number;
  summary: Record<SubscriptionChangeStatus, number>;
  overdue_scheduled: Array<{ id: string }>;
  recent_scheduler_runs: Array<{ id: string; status: 'running' | 'success' | 'error' }>;
  recent_requests?: Array<{
    id: string;
    change_type: string;
    status: SubscriptionChangeStatus;
    failure_reason: string | null;
    created_at: string;
    effective_at: string;
    retry_count?: number;
    last_retried_at?: string | null;
    last_action_note?: string | null;
  }>;
  recent_requests_total?: number;
  recent_requests_has_more?: boolean;
}

type CompanyOption = { id: string; name: string };

const SubscriptionChangeOpsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();

  const canManage = isGlobalAdmin;

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [report, setReport] = useState<SubscriptionChangeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState(false);
  const [reportDays, setReportDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<SubscriptionChangeStatus | 'all'>('all');
  const [page, setPage] = useState<number>(1);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<'retry_failed' | 'run_scheduler' | null>(null);
  const [actionReason, setActionReason] = useState('');

  useEffect(() => {
    if (!canManage || loadingGlobalAdminCheck) return;
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
          setSelectedCompanyId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0].id));
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
  }, [canManage, loadingGlobalAdminCheck]);

  const loadReport = useCallback(async () => {
    if (!selectedCompanyId || !canManage) return;
    setLoading(true);
    try {
      const response = await invokeEdgeWithAuth('get-subscription-change-report', {
        body: {
          companyId: selectedCompanyId,
          days: reportDays,
          statusFilter,
          page,
          pageSize: 12,
        },
      });
      if (response.error) {
        throw new Error(parseEdgeInvokeError(response));
      }
      setReport((response.data || null) as SubscriptionChangeReport | null);
    } catch (error: any) {
      showError(error?.message || 'Erro ao carregar relatório operacional.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, canManage, reportDays, statusFilter, page]);

  useEffect(() => {
    if (canManage && selectedCompanyId) {
      void loadReport();
    }
  }, [canManage, selectedCompanyId, loadReport]);

  useEffect(() => {
    setPage(1);
  }, [reportDays, statusFilter]);

  const openActionDialog = (action: 'retry_failed' | 'run_scheduler') => {
    setActionTarget(action);
    setActionReason('');
    setActionDialogOpen(true);
  };

  const executeAction = async () => {
    if (!selectedCompanyId || !actionTarget) return;
    const reason = actionReason.trim();
    if (!reason) {
      showError('Informe um motivo para auditoria antes de continuar.');
      return;
    }

    setRunningAction(true);
    try {
      const response = await invokeEdgeWithAuth('admin-subscription-change-actions', {
        body: {
          companyId: selectedCompanyId,
          action: actionTarget,
          reason,
          days: 7,
          limit: 200,
          maxRetries: 3,
        },
      });
      if (response.error) {
        throw new Error(parseEdgeInvokeError(response));
      }
      const payload = (response.data || {}) as { message?: string };
      showSuccess(payload.message || 'Ação executada com sucesso.');
      setActionDialogOpen(false);
      setActionTarget(null);
      setActionReason('');
      await loadReport();
    } catch (error: any) {
      showError(error?.message || 'Erro ao executar ação.');
    } finally {
      setRunningAction(false);
    }
  };

  const exportCsv = () => {
    const rows = report?.recent_requests || [];
    if (!rows.length) {
      showError('Não há dados no histórico para exportar.');
      return;
    }

    const headers = ['id', 'change_type', 'status', 'created_at', 'effective_at', 'retry_count', 'last_retried_at', 'last_action_note', 'failure_reason'];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.id,
          row.change_type,
          row.status,
          row.created_at,
          row.effective_at,
          String(row.retry_count ?? 0),
          row.last_retried_at ?? '',
          (row.last_action_note ?? '').replaceAll('"', '""'),
          (row.failure_reason ?? '').replaceAll('"', '""'),
        ]
          .map((cell) => `"${cell}"`)
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `subscription-change-ops-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const summary = report?.summary || {
    pending_payment: 0,
    scheduled: 0,
    applied: 0,
    failed: 0,
    cancelled: 0,
  };

  const hasSchedulerError = useMemo(
    () => (report?.recent_scheduler_runs || []).some((run) => run.status === 'error'),
    [report],
  );

  if (!canManage) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Operações de Assinatura</h1>
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>Somente Administrador Global pode acessar esta área.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loadingGlobalAdminCheck) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-gray-700">Carregando...</p>
      </div>
    );
  }

  if (loadingCompanies) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-gray-700">Carregando empresas...</p>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="!rounded-button" onClick={() => navigate('/admin-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Operações de Assinatura</h1>
        </div>
        <Alert>
          <AlertDescription>Nenhuma empresa cadastrada. Cadastre empresas no sistema para acompanhar operações de troca de plano.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" className="!rounded-button" onClick={() => navigate('/admin-dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Operações de Assinatura</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Este painel exibe <strong>operações de troca de plano</strong> (upgrade, downgrade, pagamento proporcional, fila e reconciliador) registradas em{' '}
            <code className="text-xs">subscription_change_requests</code>. Não exibe a primeira adesão ao plano nem faturamento geral — isso fica no fluxo de
            assinatura/cupom e no gateway.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" className="!rounded-button whitespace-nowrap" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            className="!rounded-button whitespace-nowrap"
            onClick={() => void loadReport()}
            disabled={loading || runningAction || !selectedCompanyId}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {selectedCompanyId && (
        <div className="max-w-md space-y-2">
          <Label htmlFor="sub-ops-company">Empresa</Label>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger id="sub-ops-company" className="w-full">
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
          <p className="text-xs text-gray-500">Os números e o histórico abaixo referem-se apenas à empresa selecionada.</p>
        </div>
      )}

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-xl text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Painel Operacional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            <div className="rounded-md border p-2">Pendentes: <strong>{summary.pending_payment}</strong></div>
            <div className="rounded-md border p-2">Agendados: <strong>{summary.scheduled}</strong></div>
            <div className="rounded-md border p-2">Aplicados: <strong>{summary.applied}</strong></div>
            <div className="rounded-md border p-2 text-red-700">Falhas: <strong>{summary.failed}</strong></div>
            <div className="rounded-md border p-2">Cancelados: <strong>{summary.cancelled}</strong></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={String(reportDays)} onValueChange={(value) => setReportDays(Number(value))}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SubscriptionChangeStatus | 'all')}>
              <SelectTrigger className="w-[190px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending_payment">Pendente Pagamento</SelectItem>
                <SelectItem value="scheduled">Agendado</SelectItem>
                <SelectItem value="applied">Aplicado</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {summary.failed > 0 && (
            <Alert className="border-red-300 bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Falhas detectadas</AlertTitle>
              <AlertDescription>Use "Reprocessar Falhas" com motivo para reenfileirar downgrades recuperáveis.</AlertDescription>
            </Alert>
          )}
          {(report?.overdue_scheduled.length || 0) > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Downgrades vencidos</AlertTitle>
              <AlertDescription>Existem requests agendados com data vencida. Execute o reconciliador manualmente.</AlertDescription>
            </Alert>
          )}
          {hasSchedulerError && (
            <Alert className="border-red-300 bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro recente no scheduler</AlertTitle>
              <AlertDescription>O reconciliador registrou erro em execuções recentes. Revisar operação e logs.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="!rounded-button whitespace-nowrap" disabled={runningAction} onClick={() => openActionDialog('retry_failed')}>
              Reprocessar Falhas
            </Button>
            <Button variant="outline" className="!rounded-button whitespace-nowrap" disabled={runningAction} onClick={() => openActionDialog('run_scheduler')}>
              Executar Reconciliador Agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-xl text-gray-900">Histórico de Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(report?.recent_requests || []).length === 0 ? (
            <p className="text-sm text-gray-600">{loading ? 'Carregando histórico...' : 'Sem registros para os filtros selecionados.'}</p>
          ) : (
            <>
              {(report?.recent_requests || []).map((row) => (
                <div key={row.id} className="border rounded-md p-2 bg-white text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{row.change_type.toUpperCase()} - {row.status}</span>
                    <span className="text-gray-500">{format(parseISO(row.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                  </div>
                  <div className="text-gray-700 mt-1">
                    Retry: <strong>{row.retry_count ?? 0}</strong>
                    {row.last_retried_at ? ` • Último retry: ${format(parseISO(row.last_retried_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}` : ''}
                  </div>
                  {row.last_action_note && (
                    <div className="text-gray-700 mt-1"><strong>Motivo operacional:</strong> {row.last_action_note}</div>
                  )}
                  {row.failure_reason && (
                    <div className="text-red-700 mt-1">{row.failure_reason}</div>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" className="!rounded-button whitespace-nowrap" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-xs text-gray-500">Página {page} • Total: {report?.recent_requests_total ?? 0}</span>
                <Button variant="outline" size="sm" className="!rounded-button whitespace-nowrap" disabled={!report?.recent_requests_has_more || loading} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ação operacional</DialogTitle>
            <DialogDescription>
              Informe o motivo para auditoria antes de executar esta ação.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Descreva o motivo desta ação (obrigatório)..."
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} disabled={runningAction}>
              Cancelar
            </Button>
            <Button onClick={executeAction} disabled={runningAction || !actionReason.trim()}>
              {runningAction ? 'Executando...' : 'Confirmar ação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionChangeOpsPage;

