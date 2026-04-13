import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStatusColor, createButton, createCard } from '@/lib/dashboard-utils';
import { useNavigate } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useSession } from '@/components/SessionContextProvider';
import { useMenuItems } from '@/hooks/useMenuItems';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import MonthlyRevenueChart from '@/components/MonthlyRevenueChart';
import CriticalStockReport from '@/components/CriticalStockReport';
import ArenaDashboardPanel from '@/components/ArenaDashboardPanel';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { data, loading } = useDashboardData();
  const { menuItems: dynamicMenuItems, loading: loadingMenus } = useMenuItems();
  const { isCourtMode, canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);

  if (sessionLoading || loadingPrimaryCompany || loading || loadingMenus || loadingArenaModule) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando Dashboard...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para ver o Dashboard.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para acessar o Dashboard.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-yellow-600 hover:bg-yellow-700 text-black"
          onClick={() => navigate('/register-company')}
        >
          <i className="fas fa-building mr-2"></i>
          Cadastrar Empresa
        </Button>
      </div>
    );
  }

  const hasCashRegisterPermission = dynamicMenuItems.some((menu) => {
    const key = (menu.menu_key || '').toLowerCase();
    const path = (menu.path || '').toLowerCase();
    return key === 'financeiro' || key === 'caixa' || path.includes('financeiro') || path.includes('caixa');
  });

  const hasStockPermission = dynamicMenuItems.some((menu) => {
    const key = (menu.menu_key || '').toLowerCase();
    const path = (menu.path || '').toLowerCase();
    return key === 'estoque' || path.includes('estoque');
  });

  if (isCourtMode && canUseArenaManagement) {
    return (
      <ArenaDashboardPanel
        primaryCompanyId={primaryCompanyId}
        data={data}
        navigate={navigate}
        hasCashRegisterPermission={hasCashRegisterPermission}
        hasStockPermission={hasStockPermission}
      />
    );
  }

  const kpis = [
    { 
      title: 'Faturamento do Mês', 
      value: `R$ ${data.revenue.toFixed(2).replace('.', ',')}`, 
      change: `${data.revenueChange >= 0 ? '+' : '-'}${data.revenueChange.toFixed(0)}%`, 
      icon: 'fas fa-money-bill-wave', 
      color: data.revenueChange >= 0 ? 'green' : 'red' 
    },
    { 
      title: 'Agendamentos Hoje', 
      value: data.appointmentsTodayCount.toString(), 
      change: `+${data.appointmentsTodayChange} vs ontem`, 
      icon: 'fas fa-calendar-check', 
      color: 'blue' 
    },
    { 
      title: 'Colaborador Mais Ativo', 
      value: data.mostActiveCollaborator?.name || 'N/A', 
      change: `${data.mostActiveCollaborator?.count || 0} atendimentos`, 
      icon: 'fas fa-crown', 
      color: 'yellow' 
    },
    ...(hasStockPermission ? [{
      title: 'Estoque Crítico', 
      value: `${data.criticalStockCount} itens`, 
      change: data.criticalStockCount > 0 ? 'Atenção' : 'OK', 
      icon: 'fas fa-exclamation-triangle', 
      color: data.criticalStockCount > 0 ? 'red' : 'green' 
    }] : [])
  ];

  return (
    <div className="space-y-6">
      {isCourtMode && !canUseArenaManagement ? (
        <Alert className="border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          <AlertTitle>Reserva de quadras não ativa</AlertTitle>
          <AlertDescription>
            Seu segmento está em modo arena, mas o módulo de quadras não está habilitado para esta empresa (plano ou
            sincronização de assinatura). Entre em contato com o suporte ou atualize o plano.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap gap-3 md:justify-end">
          {createButton(() => navigate(`/novo-agendamento/${primaryCompanyId}`), 'fas fa-plus', 'Novo Agendamento')}
          {createButton(() => navigate('/novo-cliente'), 'fas fa-user-plus', 'Novo Cliente')}
          {hasCashRegisterPermission && createButton(() => navigate('/fechar-caixa'), 'fas fa-cash-register', 'Fechar Caixa')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, index) => (
          <div key={kpi.title || index}>
            {createCard(kpi.title, kpi.value, kpi.change, kpi.icon, kpi.color)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200">
          <CardHeader><CardTitle className="text-gray-900">Faturamento Mensal</CardTitle></CardHeader>
          <CardContent>
            <MonthlyRevenueChart data={data.monthlyRevenueData} />
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader><CardTitle className="text-gray-900">Agendamentos Hoje</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {data.appointmentsToday.length === 0 ? (
                  <p className="text-gray-600 text-center p-4">Nenhum agendamento para hoje.</p>
                ) : (
                  data.appointmentsToday.map((agendamento) => (
                    <div key={agendamento.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(agendamento.status)}`}></div>
                        <div>
                          <p className="font-medium text-gray-900">{agendamento.client_display_name}</p>
                          <p className="text-sm text-gray-600">{agendamento.time_range} - {agendamento.service_names}</p>
                        </div>
                      </div>
                      <p className="font-semibold text-yellow-600">R$ {agendamento.total_price.toFixed(2).replace('.', ',')}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {hasStockPermission && <CriticalStockReport products={data.criticalProducts} />}

      {console.log('DashboardPage: data.criticalProducts', data.criticalProducts)} {/* DEBUG LOG */}

    </div>
  );
};

export default DashboardPage;