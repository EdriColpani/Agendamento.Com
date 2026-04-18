import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStatusColor, createButton } from '@/lib/dashboard-utils';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse, addMinutes, parseISO, addWeeks, subWeeks, addMonths, subMonths, isSameWeek, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Edit } from 'lucide-react';
import CheckoutModal from '@/components/CheckoutModal'; // Importar o novo modal
import { useParams } from 'react-router-dom'; // Importar useParams

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  total_price: number;
  total_duration_minutes: number;
  status: string;
  client_nickname: string | null; // Adicionado o novo campo
  client_id: string; // Adicionado para referência
  clients: { name: string, client_auth_id: string | null } | null; // Adicionado client_auth_id
  collaborators: { first_name: string; last_name: string } | null;
  appointment_services: { services: { name: string } | null }[];
}

interface CollaboratorFilter {
  id: string;
  first_name: string;
  last_name: string;
}

const AgendamentosPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>(); // Pega o companyId da URL

  // CRÍTICO: Se a URL contém literalmente ":companyId", redirecionar para a URL correta
  useEffect(() => {
    // Se o companyId da URL é literalmente ":companyId" (placeholder não substituído)
    if (companyIdFromUrl === ':companyId') {
      // Aguardar o primaryCompanyId estar disponível
      if (!loadingPrimaryCompany && primaryCompanyId) {
        console.log('AgendamentosPage: Detectado :companyId literal na URL. Redirecionando para:', `/agendamentos/${primaryCompanyId}`);
        navigate(`/agendamentos/${primaryCompanyId}`, { replace: true });
      }
    }
  }, [companyIdFromUrl, primaryCompanyId, loadingPrimaryCompany, navigate]);

  // Determina o ID da empresa a ser usado, priorizando o da URL (mas ignorando se for ":companyId")
  const isValidCompanyId = companyIdFromUrl && companyIdFromUrl !== ':companyId';
  const currentCompanyId = isValidCompanyId ? companyIdFromUrl : primaryCompanyId;
  const loadingCompanyId = isValidCompanyId ? false : loadingPrimaryCompany; // Se veio da URL válida, não está carregando
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [selectedTab, setSelectedTab] = useState('dia'); // State to control the active tab
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [collaboratorsList, setCollaboratorsList] = useState<CollaboratorFilter[]>([]);
  const [selectedCollaboratorFilter, setSelectedCollaboratorFilter] = useState('all');

  console.log('AgendamentosPage: session', session);
  console.log('AgendamentosPage: sessionLoading', sessionLoading);
  console.log('AgendamentosPage: companyIdFromUrl', companyIdFromUrl);
  console.log('AgendamentosPage: primaryCompanyId', primaryCompanyId);
  console.log('AgendamentosPage: currentCompanyId', currentCompanyId);
  console.log('AgendamentosPage: loadingCompanyId', loadingCompanyId);

  // Estados para o modal de checkout
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [appointmentToCheckout, setAppointmentToCheckout] = useState<{ id: string; status: string } | null>(null);

  // Funções de navegação para Semana e Mês
  const navigateWeek = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setSelectedDate(new Date());
    } else if (direction === 'prev') {
      setSelectedDate(subWeeks(selectedDate, 1));
    } else if (direction === 'next') {
      setSelectedDate(addWeeks(selectedDate, 1));
    }
  };

  const navigateMonth = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setSelectedDate(new Date());
    } else if (direction === 'prev') {
      setSelectedDate(subMonths(selectedDate, 1));
    } else if (direction === 'next') {
      setSelectedDate(addMonths(selectedDate, 1));
    }
  };

  // Função para obter o intervalo formatado da semana
  const getWeekRange = () => {
    const start = startOfWeek(selectedDate, { locale: ptBR });
    const end = endOfWeek(selectedDate, { locale: ptBR });
    return {
      start,
      end,
      formatted: `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`
    };
  };

  // Função para obter o intervalo formatado do mês
  const getMonthRange = () => {
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    return {
      start,
      end,
      formatted: format(selectedDate, 'MMMM yyyy', { locale: ptBR })
    };
  };

  // Verificar se está na semana/mês atual
  const isCurrentWeek = isSameWeek(selectedDate, new Date(), { locale: ptBR });
  const isCurrentMonth = isSameMonth(selectedDate, new Date());

  const fetchAppointments = useCallback(async () => {
    if (sessionLoading || loadingCompanyId || !currentCompanyId) {
      return;
    }

    setLoadingAppointments(true);
    try {
      let query = supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          appointment_time,
          total_price,
          total_duration_minutes,
          status,
          client_id,
          client_nickname,
          clients(name, client_auth_id),
          collaborators(first_name, last_name),
          appointment_services(
            services(name)
          )
        `)
        .eq('company_id', currentCompanyId)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      let startDate: Date | null = null;
      let endDate: Date | null = null;

      if (selectedTab === 'dia') {
        startDate = startOfDay(selectedDate);
        endDate = endOfDay(selectedDate);
      } else if (selectedTab === 'semana') {
        startDate = startOfWeek(selectedDate, { locale: ptBR });
        endDate = endOfWeek(selectedDate, { locale: ptBR });
      } else if (selectedTab === 'mes') {
        startDate = startOfMonth(selectedDate);
        endDate = endOfMonth(selectedDate);
      }

      if (startDate && endDate) {
        query = query.gte('appointment_date', format(startDate, 'yyyy-MM-dd'));
        query = query.lte('appointment_date', format(endDate, 'yyyy-MM-dd'));
      }

      if (selectedCollaboratorFilter !== 'all') {
        query = query.eq('collaborator_id', selectedCollaboratorFilter);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Process data to ensure client name is available even if RLS on clients table fails for auto-registered clients
      const processedAppointments: Appointment[] = await Promise.all(data.map(async (agendamento: any) => {
        let clientNameFromClientsTable = agendamento.clients?.name;
        let clientNickname = agendamento.client_nickname;
        
        // Fallback logic: If nickname is missing AND clients.name is missing, try to fetch from profiles
        if (!clientNickname && !clientNameFromClientsTable && agendamento.clients?.client_auth_id) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', agendamento.clients.client_auth_id)
            .single();

          if (!profileError && profileData) {
            clientNameFromClientsTable = `${profileData.first_name} ${profileData.last_name}`;
          }
        }

        // Update the object for display
        return {
          ...agendamento,
          client_nickname: clientNickname,
          clients: {
            ...agendamento.clients,
            name: clientNameFromClientsTable,
          },
        } as Appointment;
      }));

      setAppointments(processedAppointments);
    } catch (error: any) {
      console.error('Erro ao carregar agendamentos:', error);
      showError('Erro ao carregar agendamentos: ' + error.message);
      setAppointments([]);
    } finally {
      setLoadingAppointments(false);
    }
  }, [sessionLoading, loadingCompanyId, currentCompanyId, selectedTab, selectedDate, selectedCollaboratorFilter]);

  const fetchCollaborators = useCallback(async () => {
    if (sessionLoading || loadingCompanyId || !currentCompanyId) {
      return;
    }
    const { data, error } = await supabase
      .from('collaborators')
      .select('id, first_name, last_name')
      .eq('company_id', currentCompanyId)
      .eq('is_arena_system_placeholder', false)
      .order('first_name', { ascending: true });

    if (error) {
      console.error('Erro ao carregar colaboradores para filtro:', error);
    } else if (data) {
      setCollaboratorsList(data);
    }
  }, [sessionLoading, loadingCompanyId, currentCompanyId]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleOpenCheckoutModal = (id: string, status: string) => {
    setAppointmentToCheckout({ id, status });
    setIsCheckoutModalOpen(true);
  };

  const handleCheckoutComplete = () => {
    fetchAppointments(); // Re-fetch appointments to update the list
  };

  if (sessionLoading || loadingCompanyId || loadingAppointments) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando agendamentos...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para ver os agendamentos.</p>
      </div>
    );
  }

  if (!currentCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para gerenciar agendamentos.
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Agendamentos</h1>
        {createButton(() => {
          if (!currentCompanyId) {
            console.error("Botão 'Novo Agendamento' clicado, mas currentCompanyId está indefinido.");
            showError('Não foi possível identificar a empresa para o novo agendamento.');
            return;
          }
          console.log("Botão 'Novo Agendamento' clicado. Navegando para /novo-agendamento/:companyId", currentCompanyId);
          navigate(`/novo-agendamento/${currentCompanyId}`);
        }, 'fas fa-plus', 'Novo Agendamento')}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <Tabs value={selectedTab} className="w-auto" onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dia">Dia</TabsTrigger>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 focus:border-primary focus:ring-1 focus:ring-primary"
            value={selectedCollaboratorFilter}
            onChange={(e) => setSelectedCollaboratorFilter(e.target.value)}
          >
            <option value="all">Todos os Colaboradores</option>
            {collaboratorsList.map(col => (
              <option key={col.id} value={col.id}>{col.first_name} {col.last_name}</option>
            ))}
          </select>
        </div>

        {/* Navegação para Semana */}
        {selectedTab === 'semana' && (
          <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
            <Button
              variant="outline"
              size="sm"
              className="!rounded-button"
              onClick={() => navigateWeek('prev')}
            >
              <i className="fas fa-chevron-left"></i>
            </Button>
            <div className="flex-1 text-center">
              <span className="font-medium text-gray-900">{getWeekRange().formatted}</span>
              {!isCurrentWeek && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 text-xs !rounded-button text-primary hover:text-primary"
                  onClick={() => navigateWeek('today')}
                >
                  Hoje
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="!rounded-button"
              onClick={() => navigateWeek('next')}
            >
              <i className="fas fa-chevron-right"></i>
            </Button>
          </div>
        )}

        {/* Navegação para Mês */}
        {selectedTab === 'mes' && (
          <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
            <Button
              variant="outline"
              size="sm"
              className="!rounded-button"
              onClick={() => navigateMonth('prev')}
            >
              <i className="fas fa-chevron-left"></i>
            </Button>
            <div className="flex-1 text-center">
              <span className="font-medium text-gray-900 capitalize">{getMonthRange().formatted}</span>
              {!isCurrentMonth && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 text-xs !rounded-button text-primary hover:text-primary"
                  onClick={() => navigateMonth('today')}
                >
                  Hoje
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="!rounded-button"
              onClick={() => navigateMonth('next')}
            >
              <i className="fas fa-chevron-right"></i>
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {appointments.length === 0 ? (
          <p className="text-gray-600">Nenhum agendamento encontrado para {selectedTab === 'dia' ? 'o dia selecionado' : selectedTab === 'semana' ? 'a semana selecionada' : 'o mês selecionado'}.</p>
        ) : (
          appointments.map((agendamento) => {
            // Prioriza client_nickname, depois clients.name, e por último o ID truncado
            const clientNameFromClientsTable = agendamento.clients?.name;
            const clientDisplay = agendamento.client_nickname || clientNameFromClientsTable || `Cliente ID: ${agendamento.client_id.substring(0, 8)}...`;
            
            const collaboratorName = agendamento.collaborators ? `${agendamento.collaborators.first_name} ${agendamento.collaborators.last_name}` : 'Colaborador Desconhecido';
            const serviceNames = agendamento.appointment_services
              .map(as => as.services?.name)
              .filter(Boolean)
              .join(' + ');

            // Calculate end time
            const startTime = parse(agendamento.appointment_time, 'HH:mm:ss', new Date());
            const endTime = addMinutes(startTime, agendamento.total_duration_minutes);
            const formattedTimeRange = `${format(startTime, 'HH:mm')} às ${format(endTime, 'HH:mm')}`;
            const formattedDate = format(parseISO(agendamento.appointment_date), 'dd/MM/yyyy', { locale: ptBR });


            const isFinalizedOrCanceled = agendamento.status === 'concluido' || agendamento.status === 'cancelado';

            return (
              <Card key={agendamento.id} className="border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 w-1/2">
                      <div className={`w-4 h-4 rounded-full ${getStatusColor(agendamento.status)}`}></div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {clientDisplay}
                        </h3>
                        <p className="text-sm text-gray-600">{serviceNames || 'Serviço(s) Desconhecido(s)'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end w-1/4">
                      <p className="font-semibold text-gray-900">{formattedDate}</p> {/* Display date here */}
                      <p className="font-semibold text-gray-900">{formattedTimeRange}</p>
                      <p className="text-sm text-gray-600">{collaboratorName}</p>
                    </div>
                    <div className="text-right w-1/4 flex flex-col items-end gap-1">
                      <p className="font-bold text-primary">R$ {agendamento.total_price.toFixed(2).replace('.', ',')}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="!rounded-button whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCheckoutModal(agendamento.id, agendamento.status);
                        }}
                        disabled={isFinalizedOrCanceled}
                      >
                        <i className="fas fa-check-circle mr-2"></i>
                        Finalizar
                      </Button>
                      <Badge className={`${getStatusColor(agendamento.status)} text-white text-xs`}>
                        {agendamento.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/agendamentos/edit/${agendamento.id}`);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {appointmentToCheckout && currentCompanyId && (
        <CheckoutModal
          isOpen={isCheckoutModalOpen}
          onClose={() => setIsCheckoutModalOpen(false)}
          appointmentId={appointmentToCheckout.id}
          companyId={currentCompanyId}
          onCheckoutComplete={handleCheckoutComplete}
        />
      )}
    </div>
  );
};

export default AgendamentosPage;