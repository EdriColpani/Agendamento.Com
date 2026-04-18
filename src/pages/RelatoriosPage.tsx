import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useReportsData } from '@/hooks/useReportsData';
import { DateRangeKey } from '@/utils/date-utils';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from '@/components/SessionContextProvider';
import { useIsCollaborator } from '@/hooks/useIsCollaborator';
import { ServiceCommissionDetailModal } from '@/components/ServiceCommissionDetailModal'; // Importação do modal
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';

// Helper component for KPI cards
interface KpiCardProps {
  title: string;
  value: number;
  comparison: number;
  isPositive: boolean;
  iconClass: string;
  colorClass: string;
  isCurrency?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, comparison, isPositive, iconClass, colorClass, isCurrency = false }) => {
  const formattedValue = isCurrency ? `R$ ${value.toFixed(2).replace('.', ',')}` : value.toLocaleString('pt-BR');
  const comparisonText = `${isPositive ? '+' : '-'}${comparison.toFixed(0)}% vs período anterior`;
  const comparisonColor = isPositive ? 'text-green-600' : 'text-red-600';
  
  // Adjust color class for icon/background based on input
  const iconBgClass = `bg-${colorClass}-100`;
  const iconColorClass = `text-${colorClass}-600`;

  return (
    <Card className="border-gray-200">
      <CardContent className="p-6">
        <div className="text-center">
          <div className={`w-12 h-12 ${iconBgClass} rounded-lg flex items-center justify-center mx-auto mb-3`}>
            <i className={`${iconClass} ${iconColorClass} text-xl`}></i>
          </div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formattedValue}</p>
          <p className={`text-sm mt-1 ${comparisonColor}`}>{comparisonText}</p>
        </div>
      </CardContent>
    </Card>
  );
};


const RelatoriosPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCollaborator } = useIsCollaborator();
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);
  const [dateRangeKey, setDateRangeKey] = useState<DateRangeKey>('current_month');
  const { reportsData, loading, collaborators } = useReportsData(dateRangeKey);

  // Estados para o modal de detalhes de comissão por serviço
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCollaboratorForModal, setSelectedCollaboratorForModal] = useState<string | null>(null);
  const [selectedCollaboratorNameForModal, setSelectedCollaboratorNameForModal] = useState<string>('');
  const [selectedServiceCommissionsForModal, setSelectedServiceCommissionsForModal] = useState<any[]>([]);


  if (sessionLoading || loadingPrimaryCompany || loading || loadingArenaModule) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando relatórios...</p>
      </div>
    );
  }

  if (!session?.user || !primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para acessar relatórios.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/register-company')}
        >
          <i className="fas fa-building mr-2"></i>
          Cadastrar Empresa
        </Button>
      </div>
    );
  }

  const kpis = [
    { 
      title: 'Faturamento', 
      data: reportsData.revenue, 
      icon: 'fas fa-chart-line', 
      color: 'blue', 
      isCurrency: true 
    },
    { 
      title: 'Ticket Médio', 
      data: reportsData.averageTicket, 
      icon: 'fas fa-receipt', 
      color: 'green', 
      isCurrency: true 
    },
    { 
      title: 'Clientes Atendidos', 
      data: reportsData.clientsServed, 
      icon: 'fas fa-users', 
      color: 'purple', 
      isCurrency: false 
    },
    { 
      title: 'Cancelamentos', 
      data: reportsData.cancellations, 
      icon: 'fas fa-times-circle', 
      color: 'red', 
      isCurrency: false 
    },
  ];

  const handleExportReports = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleOpenServiceCommissionModal = (collaboratorId: string, collaboratorName: string) => {
    setSelectedCollaboratorForModal(collaboratorId);
    setSelectedCollaboratorNameForModal(collaboratorName);
    setSelectedServiceCommissionsForModal(reportsData.serviceCommissionsByCollaborator[collaboratorId] || []);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Relatórios</h1>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Select onValueChange={(value) => setDateRangeKey(value as DateRangeKey)} value={dateRangeKey}>
            <SelectTrigger className="w-[180px] px-4 py-2 border border-gray-300 rounded-lg text-sm">
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Mês atual</SelectItem>
              <SelectItem value="last_month">Últimos 30 dias</SelectItem>
              <SelectItem value="last_3_months">Últimos 3 meses</SelectItem>
              <SelectItem value="last_year">Último ano</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="!rounded-button whitespace-nowrap cursor-pointer"
            onClick={handleExportReports}
          >
            <i className="fas fa-download mr-2"></i>
            Exportar
          </Button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.data.value}
            comparison={kpi.data.comparison}
            isPositive={kpi.data.isPositive}
            iconClass={kpi.icon}
            colorClass={kpi.color}
            isCurrency={kpi.isCurrency}
          />
        ))}
      </div>

      {canUseArenaManagement ? (
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-gray-900 text-lg">Arena — Cancelamentos e Estornos</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700">
              Relatório operacional com quantidade de cancelamentos, motivos e status de estorno da arena.
            </p>
            <Button
              className="!rounded-button whitespace-nowrap bg-indigo-600 hover:bg-indigo-700"
              onClick={() => navigate('/relatorios/arena-cancelamentos-estornos')}
            >
              Abrir relatório da arena
            </Button>
          </CardContent>
        </Card>
      ) : null}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance por Colaborador - Ocultar para colaboradores */}
        {!isCollaborator && (
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Performance por Colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {collaborators.length === 0 ? (
                <p className="text-gray-600">Nenhum colaborador com comissões geradas no período.</p>
              ) : (
                collaborators.map((colaborador) => {
                  const isFullyPaid = colaborador.pending_amount <= 0;
                  const isPartiallyPaid = colaborador.paid_amount > 0 && colaborador.pending_amount > 0;
                  
                  return (
                  <div key={colaborador.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-sm">
                            {colaborador.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{colaborador.name}</span>
                            {isFullyPaid && (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                                <i className="fas fa-check-circle mr-1"></i>
                                Pago
                              </span>
                            )}
                            {isPartiallyPaid && (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-amber-900 rounded-full">
                                <i className="fas fa-exclamation-circle mr-1"></i>
                                Parcial
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{colaborador.appointments} atendimentos</p>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-primary">
                            Comissão Total: R$ {colaborador.commission.toFixed(2).replace('.', ',')}
                          </p>
                          {colaborador.paid_amount > 0 && (
                            <p className="text-xs text-green-600">
                              Pago: R$ {colaborador.paid_amount.toFixed(2).replace('.', ',')}
                            </p>
                          )}
                          {colaborador.pending_amount > 0 && (
                            <p className="text-xs text-red-600">
                              Pendente: R$ {colaborador.pending_amount.toFixed(2).replace('.', ',')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {reportsData.serviceCommissionsByCollaborator[colaborador.id]?.length > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3 w-full"
                        onClick={() => handleOpenServiceCommissionModal(colaborador.id, colaborador.name)}
                      >
                        Ver Detalhes da Comissão por Serviço
                      </Button>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
        )}
        
        {/* Serviços Mais Populares */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Serviços Mais Populares</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportsData.popularServices.length === 0 ? (
                <p className="text-gray-600">Nenhum serviço concluído no período.</p>
              ) : (
                reportsData.popularServices.map((item, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900">{item.service}</span>
                      <span className="text-sm text-gray-600">{item.quantity}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${item.percentual}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes de Comissão por Serviço */}
      {selectedCollaboratorForModal && (
        <ServiceCommissionDetailModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          collaboratorName={selectedCollaboratorNameForModal}
          serviceCommissions={selectedServiceCommissionsForModal}
          allServiceNames={reportsData.allServiceNames} // Passar todos os nomes de serviços
        />
      )}
    </div>
  );
};

export default RelatoriosPage;
