import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getStatusColor } from '@/lib/dashboard-utils';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { format, parse, addMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import { getTargetCompanyId, setTargetCompanyId, clearTargetCompanyId } from '@/utils/storage'; // Import storage utils

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  total_price: number;
  total_duration_minutes: number;
  status: string;
  client_nickname: string | null;
  // clients: { name: string } | null; // REMOVIDO: Causa recursão
  collaborators: { first_name: string; last_name: string } | null;
  appointment_services: { services: { name: string } | null }[];
  company_id: string;
  companies: { name: string } | null; // Adicionar para exibir o nome da empresa
}

const ClientAppointmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<string | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState(false);
  const [clientContext, setClientContext] = useState<{ clientId: string; clientName: string } | null>(null); // Novo estado para armazenar o contexto do cliente
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);

  const createClientProfileIfMissing = useCallback(async (userId: string) => {
    let clientId: string = '';
    let clientName: string = '';

    // 1. Try to fetch the client profile from 'clients' table
    const { data: existingClient, error: checkClientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('client_auth_id', userId)
      .single();

    if (checkClientError && checkClientError.code !== 'PGRST116') { // Not 'No rows found' error
      throw checkClientError;
    }

    if (existingClient) {
      clientId = existingClient.id;
      clientName = existingClient.name;
    } else {
      // 2. If client record was not found, create it
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      const name = `${profileData.first_name || 'Novo'} ${profileData.last_name || 'Cliente'}`;
      const phone = session?.user.user_metadata.phone_number || profileData.phone_number || '00000000000';
      const email = session?.user.email || 'unknown@example.com';

      const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert({
          client_auth_id: userId,
          user_id: userId, // Self-registered client
          name: name,
          phone: phone,
          email: email,
          birth_date: '1900-01-01',
          zip_code: '00000000',
          state: 'XX',
          city: 'N/A',
          address: 'N/A',
          number: '0',
          neighborhood: 'N/A',
          company_id: null, // Clients are not tied to a single company in 'clients' table
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      clientId = newClient.id;
      clientName = name;
    }

    return { clientId, clientName };

  }, [session?.user.email, session?.user.user_metadata.phone_number]);


  const [orderBy, setOrderBy] = useState<'appointment_date' | 'appointment_time'>('appointment_date');
  const [orderAscending, setOrderAscending] = useState<boolean>(false); // false = descending

  const fetchAppointments = useCallback(async () => {
    if (sessionLoading || !session?.user) {
      return;
    }

    setLoadingAppointments(true);
    try {
      // 1. Get the client's profile data (or create it if missing)
      const clientData = await createClientProfileIfMissing(session.user.id);
      const clientId = clientData.clientId;
      setClientContext(clientData); // Armazena o contexto do cliente

      // 2. Fetch all appointments for this client across all companies
      console.log('fetchAppointments: orderBy', orderBy);
      console.log('fetchAppointments: orderAscending', orderAscending);
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          appointment_time,
          total_price,
          total_duration_minutes,
          status,
          client_nickname,
          company_id,
          collaborators(first_name, last_name),
          appointment_services(
            services(name)
          ),
          companies(name)
        `)
        .eq('client_id', clientId) // Filter by the client's ID
        .order(orderBy, { ascending: orderAscending })
        .order('appointment_time', { ascending: orderAscending });

      if (error) {
        throw error;
      }

      setAppointments(data as Appointment[]);
      
      // Clear any lingering target company ID from storage, as it's no longer relevant here
      clearTargetCompanyId();

    } catch (error: any) {
      console.error('Erro ao carregar agendamentos do cliente:', error);
      showError('Erro ao carregar agendamentos: ' + error.message);
      setAppointments([]);
    } finally {
      setLoadingAppointments(false);
    }
  }, [session, sessionLoading, createClientProfileIfMissing, orderBy, orderAscending]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const handleCancelClick = (appointmentId: string) => {
    setAppointmentToCancel(appointmentId);
    setCancelReason('');
    setCancelReasonError(null);
    setIsCancelModalOpen(true);
  };

  const confirmCancel = async () => {
    if (!appointmentToCancel || !session?.user || !clientContext?.clientId) {
      showError('Erro: Dados inválidos para cancelar o agendamento.');
      return;
    }

    const trimmedReason = cancelReason.trim();
    if (trimmedReason.length < 20) {
      const message = 'Informe um motivo com pelo menos 20 caracteres.';
      setCancelReasonError(message);
      showError(message);
      return;
    }

    setCancellingAppointment(true);
    try {
      // Atualiza o agendamento pelo ID e client_id; as RLS do Supabase
      // garantem que o cliente só consiga cancelar os próprios agendamentos.
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelado', cancellation_reason: trimmedReason })
        .eq('id', appointmentToCancel)
        .eq('client_id', clientContext.clientId);

      console.log('Resultado do cancelamento de agendamento (cliente) - erro:', error);

      if (error) {
        throw error;
      }

      showSuccess('Agendamento cancelado com sucesso!');
      fetchAppointments(); // Re-fetch to update the list
      setIsCancelModalOpen(false);
      setAppointmentToCancel(null);
      setCancelReason('');
      setCancelReasonError(null);
    } catch (error: any) {
      console.error('Erro ao cancelar agendamento:', error);
      showError('Erro ao cancelar agendamento: ' + (error.message || 'Erro desconhecido.'));
    } finally {
      setCancellingAppointment(false);
    }
  };

  if (sessionLoading || loadingAppointments) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando seus agendamentos...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para ver seus agendamentos.</p>
      </div>
    );
  }
  
  const clientName = clientContext?.clientName || 'Cliente';

  const handleNewAppointmentClick = () => {
    navigate('/selecionar-empresa');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Meus Agendamentos</h1>
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <Select onValueChange={(value: 'appointment_date' | 'appointment_time') => { setOrderBy(value); fetchAppointments(); }} value={orderBy}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Ordenar por</SelectLabel>
                <SelectItem value="appointment_date">Data do Agendamento</SelectItem>
                <SelectItem value="appointment_time">Hora do Agendamento</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select onValueChange={(value: string) => { setOrderAscending(value === 'asc'); fetchAppointments(); }} value={orderAscending ? 'asc' : 'desc'}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Ordem" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Ordem</SelectLabel>
                <SelectItem value="asc">Crescente</SelectItem>
                <SelectItem value="desc">Decrescente</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 w-full md:w-auto"
            onClick={handleNewAppointmentClick}
          >
            <i className="fas fa-plus mr-2"></i>
            Novo Agendamento
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {appointments.filter(a => a.status !== 'cancelado').length === 0 ? (
          <p className="text-gray-600">Você não possui agendamentos. Clique em "Novo Agendamento" para começar!</p>
        ) : (
          appointments
            .filter((agendamento) => agendamento.status !== 'cancelado')
            .map((agendamento) => {
            const collaboratorName = agendamento.collaborators ? `${agendamento.collaborators.first_name} ${agendamento.collaborators.last_name}` : 'Colaborador Desconhecido';
            const serviceNames = agendamento.appointment_services
              .map(as => as.services?.name)
              .filter(Boolean)
              .join(' + ');
            const companyName = agendamento.companies?.name || 'Empresa Desconhecida';

            const startTime = parse(agendamento.appointment_time, 'HH:mm:ss', new Date());
            const endTime = addMinutes(startTime, agendamento.total_duration_minutes);
            const formattedTimeRange = `${format(startTime, 'HH:mm')} às ${format(endTime, 'HH:mm')}`;
            const formattedDate = format(parseISO(agendamento.appointment_date), 'dd/MM/yyyy', { locale: ptBR });

            const isCancellable = agendamento.status !== 'cancelado' && agendamento.status !== 'concluido';

            return (
              <Card key={agendamento.id} className="border-gray-200 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 ${getStatusColor(agendamento.status)}`}></div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {agendamento.client_nickname || clientName}
                        </h3>
                        <p className="text-sm text-gray-600 truncate">{serviceNames || 'Serviço(s) Desconhecido(s)'}</p>
                        <p className="text-xs text-gray-500 truncate">Empresa: {companyName}</p>
                      </div>
                    </div>
                    <div className="flex flex-row md:flex-col items-start md:items-end gap-2 md:gap-1 md:w-1/4">
                      <p className="font-semibold text-gray-900 text-sm md:text-base">{formattedDate}</p>
                      <p className="font-semibold text-gray-900 text-sm md:text-base">{formattedTimeRange}</p>
                      <p className="text-xs md:text-sm text-gray-600">{collaboratorName}</p>
                    </div>
                    <div className="text-left md:text-right flex flex-row md:flex-col items-start md:items-end gap-2 md:gap-1 md:w-1/4">
                      <p className="font-bold text-primary text-base md:text-lg">R$ {agendamento.total_price.toFixed(2).replace('.', ',')}</p>
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

      <Dialog
        open={isCancelModalOpen}
        onOpenChange={(open) => {
          setIsCancelModalOpen(open);
          if (!open) {
            setCancelReason('');
            setCancelReasonError(null);
            setAppointmentToCancel(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Cancelamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Motivo do cancelamento
            </label>
            <Textarea
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                if (cancelReasonError && e.target.value.trim().length >= 20) {
                  setCancelReasonError(null);
                }
              }}
              rows={4}
              maxLength={500}
              placeholder="Descreva o motivo do cancelamento (mínimo de 20 caracteres)..."
              className="w-full"
              disabled={cancellingAppointment}
            />
            <p className="text-xs text-gray-500">
              {cancelReason.trim().length} / 500 caracteres
            </p>
            {cancelReasonError && (
              <p className="text-xs text-red-500">{cancelReasonError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={cancellingAppointment}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={cancellingAppointment}
            >
              {cancellingAppointment ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientAppointmentsPage;