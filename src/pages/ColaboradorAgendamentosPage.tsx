import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStatusColor } from '@/lib/dashboard-utils';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { useIsCollaborator } from '@/hooks/useIsCollaborator';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parse, addMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  total_price: number;
  total_duration_minutes: number;
  status: string;
  client_nickname: string | null;
  client_id: string;
  clients: { name: string, client_auth_id: string | null } | null;
  company_id: string;
  appointment_services: { 
    service_id: string;
    services: { name: string } | null;
  }[];
}

const ColaboradorAgendamentosPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { isCollaborator, loading: loadingCollaboratorCheck } = useIsCollaborator();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [selectedTab, setSelectedTab] = useState('dia');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [collaboratorId, setCollaboratorId] = useState<string | null>(null);
  const [finalizingAppointmentId, setFinalizingAppointmentId] = useState<string | null>(null);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('dinheiro');

  // Buscar ID do colaborador baseado no user_id
  const fetchCollaboratorId = useCallback(async () => {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from('collaborators')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('is_arena_system_placeholder', false)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Erro ao buscar colaborador:', error);
    } else if (data) {
      setCollaboratorId(data.id);
    }
  }, [session]);

  useEffect(() => {
    fetchCollaboratorId();
  }, [fetchCollaboratorId]);

  const fetchAppointments = useCallback(async () => {
    if (sessionLoading || loadingCollaboratorCheck || !collaboratorId) {
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
          company_id,
          clients(name, client_auth_id),
          appointment_services(
            service_id,
            services(name)
          )
        `)
        .eq('collaborator_id', collaboratorId)
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

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      // Process data to ensure client name is available
      const processedAppointments: Appointment[] = await Promise.all((data || []).map(async (agendamento: any) => {
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
  }, [sessionLoading, loadingCollaboratorCheck, collaboratorId, selectedTab, selectedDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleFinalizeService = async (appointmentId: string) => {
    if (!appointmentId || !collaboratorId || !session?.user) {
      showError('Erro: Dados incompletos para finalizar o serviço.');
      return;
    }

    setFinalizingAppointmentId(appointmentId);
    setPaymentMethod('dinheiro'); // Reset para padrão
    setIsFinalizeDialogOpen(true);
  };

  const confirmFinalizeService = async () => {
    if (!finalizingAppointmentId || !collaboratorId || !session?.user) {
      showError('Erro: Dados incompletos para finalizar o serviço.');
      setIsFinalizeDialogOpen(false);
      return;
    }

    try {
      // Chamar Edge Function para finalizar agendamento
      const response = await supabase.functions.invoke('finalize-appointment-by-collaborator', {
        body: JSON.stringify({
          appointmentId: finalizingAppointmentId,
          collaboratorId: collaboratorId,
          paymentMethod: paymentMethod, // Adicionar forma de pagamento
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        let errorMessage = 'Erro ao finalizar serviço.';
        if (response.error.context?.data?.error) {
          errorMessage = response.error.context.data.error;
        } else if (response.error.message) {
          errorMessage = response.error.message;
        }
        throw new Error(errorMessage);
      }

      // Verificar resposta de sucesso
      const responseData = response.data;
      let successMessage = 'Serviço finalizado com sucesso!';
      
      if (responseData?.commission && responseData.commission > 0) {
        successMessage = `Serviço finalizado com sucesso! Comissão de R$ ${responseData.commission.toFixed(2).replace('.', ',')} gerada.`;
      }

      showSuccess(successMessage);
      setIsFinalizeDialogOpen(false);
      setFinalizingAppointmentId(null);
      setPaymentMethod('dinheiro'); // Reset
      fetchAppointments(); // Atualizar lista
    } catch (error: any) {
      console.error('Erro ao finalizar serviço:', error);
      showError('Erro ao finalizar serviço: ' + error.message);
      setIsFinalizeDialogOpen(false);
    }
  };

  if (sessionLoading || loadingCollaboratorCheck || loadingAppointments) {
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

  if (!isCollaborator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Acesso negado. Esta página é exclusiva para colaboradores.</p>
      </div>
    );
  }

  if (!collaboratorId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando informações do colaborador...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Meus Agendamentos</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <Tabs value={selectedTab} className="w-auto" onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dia">Dia</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          type="date"
          value={format(selectedDate, 'yyyy-MM-dd')}
          onChange={(e) => setSelectedDate(new Date(e.target.value))}
          className="w-auto"
        />
      </div>

      <div className="grid gap-4">
        {appointments.length === 0 ? (
          <p className="text-gray-600">Nenhum agendamento encontrado para {selectedTab === 'dia' ? 'o dia selecionado' : selectedTab === 'semana' ? 'a semana selecionada' : 'o mês selecionado'}.</p>
        ) : (
          appointments.map((agendamento) => {
            const clientNameFromClientsTable = agendamento.clients?.name;
            const clientDisplay = agendamento.client_nickname || clientNameFromClientsTable || `Cliente ID: ${agendamento.client_id.substring(0, 8)}...`;
            
            const serviceNames = agendamento.appointment_services
              .map(as => as.services?.name)
              .filter(Boolean)
              .join(' + ');

            const startTime = parse(agendamento.appointment_time, 'HH:mm:ss', new Date());
            const endTime = addMinutes(startTime, agendamento.total_duration_minutes);
            const formattedTimeRange = `${format(startTime, 'HH:mm')} às ${format(endTime, 'HH:mm')}`;
            const formattedDate = format(parseISO(agendamento.appointment_date), 'dd/MM/yyyy', { locale: ptBR });

            const canFinalize = agendamento.status === 'pendente' || agendamento.status === 'confirmado';
            const isFinalized = agendamento.status === 'concluido';

            return (
              <Card key={agendamento.id} className="border-gray-200">
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
                      <p className="font-semibold text-gray-900">{formattedDate}</p>
                      <p className="font-semibold text-gray-900">{formattedTimeRange}</p>
                    </div>
                    <div className="text-right w-1/4 flex flex-col items-end gap-1">
                      <p className="font-bold text-yellow-600">R$ {agendamento.total_price.toFixed(2).replace('.', ',')}</p>
                      {canFinalize && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="!rounded-button whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleFinalizeService(agendamento.id)}
                        >
                          <i className="fas fa-check-circle mr-2"></i>
                          Finalizar Serviço
                        </Button>
                      )}
                      {isFinalized && (
                        <Badge className="bg-green-600 text-white text-xs">
                          Finalizado
                        </Badge>
                      )}
                      <Badge className={`${getStatusColor(agendamento.status)} text-white text-xs`}>
                        {agendamento.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalizar Serviço</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja finalizar este serviço? Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Marcar o agendamento como concluído</li>
                <li>Calcular e gerar comissões (se configuradas)</li>
                <li>Registrar no financeiro</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-2">
                Forma de Pagamento *
              </Label>
              <Select onValueChange={setPaymentMethod} value={paymentMethod}>
                <SelectTrigger id="paymentMethod" className="w-full">
                  <SelectValue placeholder="Selecione a forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsFinalizeDialogOpen(false);
                setFinalizingAppointmentId(null);
                setPaymentMethod('dinheiro');
              }}
            >
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={confirmFinalizeService}
            >
              Confirmar Finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ColaboradorAgendamentosPage;

