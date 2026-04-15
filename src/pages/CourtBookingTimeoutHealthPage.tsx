import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { showError } from '@/utils/toast';

type TimeoutRunRow = {
  id: string;
  status: 'running' | 'success' | 'error' | string;
  timeout_minutes: number;
  scan_limit: number;
  found_count: number;
  cancelled_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
};

type TimeoutSummary = {
  window_hours: number;
  runs_window: number;
  errors_window: number;
  cancelled_window: number;
};

function parseInvokeError(response: {
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
    if (ctx && typeof ctx === 'object' && 'error' in (ctx as object)) {
      return String((ctx as { error?: string }).error || response.error.message || 'Erro na Edge Function.');
    }
    return response.error.message || 'Erro na Edge Function.';
  }
  if (response.data && typeof response.data === 'object' && 'error' in (response.data as object)) {
    return String((response.data as { error?: string }).error || 'Erro na Edge Function.');
  }
  return 'Erro na Edge Function.';
}

const CourtBookingTimeoutHealthPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();

  const [summary, setSummary] = useState<TimeoutSummary | null>(null);
  const [runs, setRuns] = useState<TimeoutRunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [windowHours, setWindowHours] = useState<24 | 168>(24);

  const loadData = useCallback(async (hours: 24 | 168 = windowHours) => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('get-court-booking-timeout-runs', {
        body: JSON.stringify({
          window_hours: hours,
          latest_limit: 20,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error || (response.data && typeof response.data === 'object' && 'error' in response.data)) {
        throw new Error(parseInvokeError(response));
      }

      const payload = response.data as {
        summary?: TimeoutSummary;
        latest_runs?: TimeoutRunRow[];
      };
      setSummary(payload.summary ?? null);
      setRuns(Array.isArray(payload.latest_runs) ? payload.latest_runs : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar saúde do timeout da arena.';
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, windowHours]);

  useEffect(() => {
    if (session?.access_token) {
      loadData(windowHours);
    }
  }, [session?.access_token, loadData, windowHours]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Saúde Arena — Timeout de Pagamento</h1>
      </div>

      <Card className="border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 text-xl flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Monitoramento de Timeout
            </CardTitle>
            <p className="text-sm text-gray-700 mt-1">
              Execuções automáticas que cancelam reservas públicas sem pagamento aprovado.
            </p>
          </div>
          <Button
            variant="outline"
            className="!rounded-button whitespace-nowrap"
            onClick={() => loadData(windowHours)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={windowHours === 24 ? 'default' : 'outline'}
              className="!rounded-button"
              onClick={() => {
                setWindowHours(24);
                loadData(24);
              }}
              disabled={loading}
            >
              Últimas 24h
            </Button>
            <Button
              type="button"
              variant={windowHours === 168 ? 'default' : 'outline'}
              className="!rounded-button"
              onClick={() => {
                setWindowHours(168);
                loadData(168);
              }}
              disabled={loading}
            >
              Últimos 7 dias
            </Button>
            <p className="text-xs text-gray-500 ml-1">
              Janela atual: {summary?.window_hours ?? windowHours}h
            </p>
          </div>

          {summary && summary.errors_window > 0 ? (
            <div className="rounded-md border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm">
              Atenção: há {summary.errors_window} execução(ões) com erro na janela selecionada.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Execuções (janela)</p>
              <p className="text-2xl font-semibold text-gray-900">{summary?.runs_window ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Erros (janela)</p>
              <p className="text-2xl font-semibold text-red-600">{summary?.errors_window ?? '-'}</p>
            </div>
            <div className="rounded-md border p-3 bg-white">
              <p className="text-xs text-gray-500">Reservas canceladas (janela)</p>
              <p className="text-2xl font-semibold text-amber-700">{summary?.cancelled_window ?? '-'}</p>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Timeout</th>
                  <th className="px-3 py-2">Encontradas</th>
                  <th className="px-3 py-2">Canceladas</th>
                  <th className="px-3 py-2">Duração</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={6}>
                      {loading ? 'Carregando execuções...' : 'Sem execuções registradas ainda.'}
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-gray-700">
                        {new Date(run.started_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            run.status === 'success'
                              ? 'bg-green-100 text-green-700'
                              : run.status === 'error'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}
                          title={run.error_message || ''}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{run.timeout_minutes} min</td>
                      <td className="px-3 py-2 text-gray-700">{run.found_count}</td>
                      <td className="px-3 py-2 text-gray-700">{run.cancelled_count}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {run.duration_ms != null ? `${run.duration_ms} ms` : '-'}
                      </td>
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

export default CourtBookingTimeoutHealthPage;
