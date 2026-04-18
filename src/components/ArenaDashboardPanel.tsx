import React from 'react';
import { Link, type NavigateFunction } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getStatusColor, createButton, createCard } from '@/lib/dashboard-utils';
import type { DashboardData } from '@/hooks/useDashboardData';
import MonthlyRevenueChart from '@/components/MonthlyRevenueChart';
import CriticalStockReport from '@/components/CriticalStockReport';
import { Info } from 'lucide-react';

interface ArenaDashboardPanelProps {
  primaryCompanyId: string;
  data: DashboardData;
  navigate: NavigateFunction;
  hasCashRegisterPermission: boolean;
  hasStockPermission: boolean;
}

/**
 * Dashboard inicial para empresas com segmento em modo arena/quadras.
 * Reutiliza KPIs existentes até existir métrica específica de quadras.
 */
const ArenaDashboardPanel: React.FC<ArenaDashboardPanelProps> = ({
  primaryCompanyId,
  data,
  navigate,
  hasCashRegisterPermission,
  hasStockPermission,
}) => {
  const kpis = [
    {
      title: 'Faturamento do mês',
      value: `R$ ${data.revenue.toFixed(2).replace('.', ',')}`,
      change: `${data.revenueChange >= 0 ? '+' : '-'}${data.revenueChange.toFixed(0)}%`,
      icon: 'fas fa-money-bill-wave',
      color: data.revenueChange >= 0 ? 'green' : 'red',
    },
    {
      title: 'Reservas hoje',
      value: data.appointmentsTodayCount.toString(),
      change: `+${data.appointmentsTodayChange} vs ontem`,
      icon: 'fas fa-calendar-check',
      color: 'blue',
    },
    ...(hasStockPermission
      ? [
          {
            title: 'Estoque crítico',
            value: `${data.criticalStockCount} itens`,
            change: data.criticalStockCount > 0 ? 'Atenção' : 'OK',
            icon: 'fas fa-exclamation-triangle',
            color: data.criticalStockCount > 0 ? 'red' : 'green',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50 dark:border-emerald-800">
        <Info className="h-4 w-4" />
        <AlertTitle>Modo arena / quadras</AlertTitle>
        <AlertDescription>
          O segmento está em modo arena e o módulo de quadras está ativo no plano. Clientes podem reservar pelo link
          público (sem login) enquanto a empresa mantiver o módulo habilitado.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard — Arena / quadras</h1>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Button
            type="button"
            asChild
            className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link to="/quadras">
              <i className="fas fa-border-all mr-2" />
              Gerenciar quadras
            </Link>
          </Button>
          <Button type="button" variant="outline" asChild className="!rounded-button whitespace-nowrap">
            <Link to={`/reservar-quadra/${primaryCompanyId}`} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-external-link-alt mr-2" />
              Abrir reserva pública
            </Link>
          </Button>
          <Button type="button" variant="outline" asChild className="!rounded-button whitespace-nowrap">
            <Link to="/quadras/reservas">
              <i className="fas fa-list mr-2" />
              Lista de reservas
            </Link>
          </Button>
          {createButton(
            () => navigate(`/novo-agendamento/${primaryCompanyId}`),
            'fas fa-plus',
            'Nova reserva',
          )}
          {createButton(() => navigate('/novo-cliente'), 'fas fa-user-plus', 'Novo cliente')}
          {hasCashRegisterPermission &&
            createButton(() => navigate('/fechar-caixa'), 'fas fa-cash-register', 'Fechar caixa')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi, index) => (
          <div key={kpi.title || index}>{createCard(kpi.title, kpi.value, kpi.change, kpi.icon, kpi.color)}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Faturamento mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyRevenueChart data={data.monthlyRevenueData} />
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Reservas de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {data.appointmentsToday.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400 text-center p-4">
                    Nenhuma reserva para hoje.
                  </p>
                ) : (
                  data.appointmentsToday.map((agendamento) => (
                    <div
                      key={agendamento.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(agendamento.status)}`} />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {agendamento.client_display_name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {agendamento.time_range} — {agendamento.service_names}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-primary">
                        R$ {agendamento.total_price.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {hasStockPermission && <CriticalStockReport products={data.criticalProducts} />}
    </div>
  );
};

export default ArenaDashboardPanel;
