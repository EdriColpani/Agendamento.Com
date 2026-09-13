import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, BarChart3, Download, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

type TrialMetricsReport = {
  period_days: number;
  generated_at: string;
  trial_settings?: { trial_enabled?: boolean; trial_days_default?: number };
  summary: {
    trials_started: number;
    trials_active: number;
    trials_expired_in_period: number;
    conversions: number;
    conversion_rate_pct: number;
    whatsapp_connected: number;
    whatsapp_eligible: number;
    whatsapp_connected_pct: number;
    churn_after_first_month: number;
    targets: { conversion_rate_pct: number; whatsapp_connected_pct: number };
  };
  status_breakdown: Array<{ status: string; count: number }>;
  funnel_emails: Array<{ days_since_start: number; sent: number }>;
  recent_conversions: Array<{
    id: string;
    company_name: string;
    plan_name: string | null;
    converted_at: string;
    source: string;
  }>;
  expired_without_conversion: Array<{
    subscription_id: string;
    company_name: string;
    plan_name: string | null;
    trial_ends_at: string;
  }>;
  scheduler_health: {
    expiration_runs: Array<{
      status: string;
      started_at: string;
      expired_count: number;
    }>;
  };
};

function formatPct(value: number): string {
  return `${Number(value).toFixed(1).replace('.', ',')}%`;
}

function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

function targetBadge(current: number, target: number): string {
  return current >= target ? 'text-green-700' : 'text-amber-700';
}

const TrialMetricsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const [reportDays, setReportDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<TrialMetricsReport | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_trial_metrics_report', { p_days: reportDays });
      if (error) throw error;
      setReport(data as TrialMetricsReport);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar métricas.';
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [reportDays]);

  useEffect(() => {
    if (isGlobalAdmin && !loadingGlobalAdminCheck) {
      void loadReport();
    }
  }, [isGlobalAdmin, loadingGlobalAdminCheck, loadReport]);

  const exportCsv = () => {
    const rows = report?.recent_conversions ?? [];
    if (!rows.length) {
      showError('Não há conversões no período para exportar.');
      return;
    }
    const headers = ['company_name', 'plan_name', 'converted_at', 'source'];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        [row.company_name, row.plan_name ?? '', row.converted_at, row.source]
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trial-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const schedulerError = useMemo(
    () => (report?.scheduler_health.expiration_runs ?? []).some((r) => r.status === 'error'),
    [report],
  );

  if (loadingGlobalAdminCheck) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-gray-700">Carregando...</p>
      </div>
    );
  }

  if (!isGlobalAdmin) {
    return (
      <div className="space-y-6 p-6">
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>Somente Administrador Global pode acessar esta área.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const summary = report?.summary;
  const targets = summary?.targets;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="!rounded-button" onClick={() => navigate('/admin-dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-emerald-600" />
                Métricas Trial
              </h1>
              <p className="text-sm text-gray-600">
                Funil teste grátis → conversão pago · meta conversão {targets?.conversion_rate_pct ?? 15}%
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(reportDays)} onValueChange={(v) => setReportDays(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="!rounded-button" onClick={() => void loadReport()} disabled={loading}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button variant="outline" className="!rounded-button" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV conversões
            </Button>
          </div>
        </div>

        {report?.trial_settings?.trial_enabled === false && (
          <Alert>
            <AlertTitle>Trial desligado</AlertTitle>
            <AlertDescription>
              trial_enabled está desligado — novos cadastros não iniciam teste. Métricas refletem histórico existente.
            </AlertDescription>
          </Alert>
        )}

        {schedulerError && (
          <Alert className="border-red-300 bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Cron de expiração com erro recente</AlertTitle>
            <AlertDescription>Verifique a tabela trial_expiration_scheduler_runs no Supabase.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Trials iniciados</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{summary?.trials_started ?? '—'}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Trials ativos agora</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{summary?.trials_active ?? '—'}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Conversões trial → pago</CardTitle></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{summary?.conversions ?? '—'}</p>
              <p className={`text-sm font-semibold ${targetBadge(summary?.conversion_rate_pct ?? 0, targets?.conversion_rate_pct ?? 15)}`}>
                {formatPct(summary?.conversion_rate_pct ?? 0)} (meta {targets?.conversion_rate_pct ?? 15}%)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">WhatsApp conectado no trial</CardTitle></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {summary?.whatsapp_connected ?? 0}/{summary?.whatsapp_eligible ?? 0}
              </p>
              <p className={`text-sm font-semibold ${targetBadge(summary?.whatsapp_connected_pct ?? 0, targets?.whatsapp_connected_pct ?? 50)}`}>
                {formatPct(summary?.whatsapp_connected_pct ?? 0)} (meta {targets?.whatsapp_connected_pct ?? 50}%)
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">Status das assinaturas com trial</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(report?.status_breakdown ?? []).map((row) => (
                <div key={row.status} className="flex justify-between border-b border-gray-100 py-2">
                  <span className="font-medium capitalize">{row.status}</span>
                  <span>{row.count}</span>
                </div>
              ))}
              {!report?.status_breakdown?.length && <p className="text-gray-500">Sem dados.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Funil de e-mails (período)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(report?.funnel_emails ?? []).map((row) => (
                <div key={row.days_since_start} className="flex justify-between border-b border-gray-100 py-2">
                  <span>Dia {row.days_since_start}</span>
                  <span>{row.sent} enviados</span>
                </div>
              ))}
              {!report?.funnel_emails?.length && <p className="text-gray-500">Nenhum e-mail registrado no período.</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Conversões recentes</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4">Plano</th>
                  <th className="py-2 pr-4">Convertido em</th>
                  <th className="py-2">Origem</th>
                </tr>
              </thead>
              <tbody>
                {(report?.recent_conversions ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{row.company_name}</td>
                    <td className="py-2 pr-4">{row.plan_name ?? '—'}</td>
                    <td className="py-2 pr-4">{formatDateTime(row.converted_at)}</td>
                    <td className="py-2">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report?.recent_conversions?.length && <p className="text-gray-500">Nenhuma conversão no período.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Trials expirados sem conversão</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4">Plano</th>
                  <th className="py-2">Expirou em</th>
                </tr>
              </thead>
              <tbody>
                {(report?.expired_without_conversion ?? []).map((row) => (
                  <tr key={row.subscription_id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{row.company_name}</td>
                    <td className="py-2 pr-4">{row.plan_name ?? '—'}</td>
                    <td className="py-2">{formatDateTime(row.trial_ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report?.expired_without_conversion?.length && (
              <p className="text-gray-500">Nenhum trial expirado sem conversão no período.</p>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-gray-500">
          Churn pós 1º mês (convertidos há 30+ dias sem assinatura ativa):{' '}
          <strong>{summary?.churn_after_first_month ?? 0}</strong>
          {report?.generated_at ? ` · Gerado em ${formatDateTime(report.generated_at)}` : null}
        </p>
      </div>
    </div>
  );
};

export default TrialMetricsPage;
