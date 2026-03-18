import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { Calendar } from "@/components/ui/calendar"; // Importar Calendar
import { format, addMinutes, setHours, setMinutes, isBefore, isAfter, parseISO, parse, startOfDay } from 'date-fns'; // Importar funções de data
import { ptBR } from 'date-fns/locale'; // Importar locale para o calendário
import { getAvailableTimeSlots } from '@/utils/appointment-scheduling'; // Importar utilitário de agendamento
import { checkWhatsAppMenuAccess } from '@/utils/checkWhatsAppMenuAccess'; // Importar verificação de acesso ao menu WhatsApp

// Zod schema for new appointment registration
const newAppointmentSchema = z.object({
  clientId: z.string().min(1, "Cliente é obrigatório."),
  clientNickname: z.string().optional(), // Novo campo de apelido
  collaboratorId: z.string().min(1, "Colaborador é obrigatório."),
  serviceIds: z.array(z.string()).min(1, "Selecione pelo menos um serviço."),
  appointmentDate: z.string().min(1, "Data é obrigatória."),
  appointmentTime: z.string().min(1, "Horário é obrigatório."),
  // paymentMethod: z.string().min(1, "Forma de pagamento é obrigatória."), // REMOVIDO
  observations: z.string().max(500, "Máximo de 500 caracteres.").optional(),
});

type NewAppointmentFormValues = z.infer<typeof newAppointmentSchema>;

interface Client {
  id: string;
  name: string;
}

interface Collaborator {
  id: string;
  first_name: string;
  last_name: string;
}

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

const NovoAgendamentoPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { companyId: currentCompanyId } = useParams<{ companyId: string }>(); // Sempre pega o companyId da URL
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [allowedServiceIds, setAllowedServiceIds] = useState<string[]>([]);
  const [commissionByService, setCommissionByService] = useState<Record<string, { type?: string; value?: number }>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [totalDurationMinutes, setTotalDurationMinutes] = useState(0);
  const [totalPriceCalculated, setTotalPriceCalculated] = useState(0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewAppointmentFormValues>({
    resolver: zodResolver(newAppointmentSchema),
    defaultValues: {
      clientId: '',
      clientNickname: '', // Default value for new field
      collaboratorId: '',
      serviceIds: [],
      appointmentDate: '',
      appointmentTime: '',
      // paymentMethod: 'dinheiro', // REMOVIDO
      observations: '',
    },
  });

  const selectedClientId = watch('clientId');
  const selectedClientNickname = watch('clientNickname'); // Watch new field
  const selectedCollaboratorId = watch('collaboratorId');
  const selectedServiceIds = watch('serviceIds');
  const selectedAppointmentTime = watch('appointmentTime');
  // const selectedPaymentMethod = watch('paymentMethod'); // REMOVIDO

  const fetchInitialData = useCallback(async () => {
    if (sessionLoading || !currentCompanyId) {
      return;
    }

    setLoadingData(true);
    try {
      // Fetch Clients: Apenas clientes cadastrados pela empresa atual
      // Nota: Clientes auto-registrados (company_id = null) ainda podem fazer agendamentos
      // via outras rotas (GuestAppointmentPage, ClientAppointmentForm), mas não aparecem neste filtro
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('company_id', currentCompanyId)
        .order('name', { ascending: true });

      if (clientsError) throw clientsError;
      setClients(clientsData);

      // Fetch Collaborators - apenas profissionais com função "Colaborador"
      const { data: collaboratorsData, error: collaboratorsError } = await supabase
        .from('collaborators')
        .select(`
          id,
          first_name,
          last_name,
          role_type_id,
          role_types(description)
        `)
        .eq('company_id', currentCompanyId)
        .order('first_name', { ascending: true });

      if (collaboratorsError) throw collaboratorsError;

      const professionalCollaborators = (collaboratorsData || []).filter((col: any) => {
        const roleDescription = (col.role_types as { description?: string } | null)?.description || '';
        return roleDescription.toLowerCase().includes('colaborador');
      });

      setCollaborators(
        professionalCollaborators.map((col: any) => ({
          id: col.id,
          first_name: col.first_name,
          last_name: col.last_name,
        }))
      );

      // Fetch Services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name, price, duration_minutes')
        .eq('company_id', currentCompanyId)
        .eq('status', 'Ativo') // Only active services
        .order('name', { ascending: true });

      if (servicesError) throw servicesError;
      setServices(servicesData);

    } catch (error: any) {
      console.error('Erro ao carregar dados iniciais:', error);
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoadingData(false);
    }
  }, [sessionLoading, currentCompanyId]);

  useEffect(() => {
    if (!session && !sessionLoading) {
      showError('Você precisa estar logado para criar agendamentos.');
      navigate('/login');
    }
    fetchInitialData();
  }, [session, sessionLoading, navigate, fetchInitialData]);

  // Carrega serviços permitidos para o colaborador selecionado.
  // Importante: dependemos apenas do colaborador e da empresa para evitar loops de renderização.
  useEffect(() => {
    const loadAllowed = async () => {
      if (!selectedCollaboratorId || !currentCompanyId) {
        console.log('NovoAgendamentoPage.loadAllowed: sem colaborador ou companyId', {
          selectedCollaboratorId,
          currentCompanyId,
        });
        setAllowedServiceIds([]);
        setCommissionByService({});
        setValue('serviceIds', [], { shouldValidate: true });
        return;
      }

      // Sempre limpa serviços selecionados ao trocar de colaborador
      console.log('NovoAgendamentoPage.loadAllowed: carregando serviços para colaborador', {
        selectedCollaboratorId,
        currentCompanyId,
      });
      setValue('serviceIds', [], { shouldValidate: true });

      const { data, error } = await supabase
        .from('collaborator_services')
        .select('service_id, commission_type, commission_value')
        .eq('company_id', currentCompanyId)
        .eq('collaborator_id', selectedCollaboratorId)
        .eq('active', true);

      if (error) {
        console.error('NovoAgendamentoPage.loadAllowed: erro ao carregar serviços permitidos:', error);
        showError('Erro ao carregar serviços permitidos para o colaborador.');
        setAllowedServiceIds([]);
        setCommissionByService({});
        return;
      }

      console.log('NovoAgendamentoPage.loadAllowed: resultado collaborator_services', {
        raw: data,
      });

      const ids = (data || []).map((d: any) => d.service_id);
      const commissionMap = (data || []).reduce<Record<string, { type?: string; value?: number }>>(
        (acc, cur: any) => {
          acc[cur.service_id] = { type: cur.commission_type, value: cur.commission_value };
          return acc;
        },
        {}
      );

      console.log('NovoAgendamentoPage.loadAllowed: ids permitidos', ids);

      setCommissionByService(commissionMap);
      setAllowedServiceIds(ids);
    };

    loadAllowed();
  }, [selectedCollaboratorId, currentCompanyId, setValue]);

  // Effect to calculate total duration and price when services change
  useEffect(() => {
    const selected = services.filter(s => selectedServiceIds.includes(s.id));
    const duration = selected.reduce((sum, service) => sum + service.duration_minutes, 0);
    const price = selected.reduce((sum, service) => sum + service.price, 0);
    setTotalDurationMinutes(duration);
    setTotalPriceCalculated(price);
  }, [selectedServiceIds, services]);

  // Effect to fetch available time slots
  useEffect(() => {
    const fetchSlots = async () => {
      if (selectedCollaboratorId && selectedDate && totalDurationMinutes > 0 && currentCompanyId) {
        setLoading(true);
        setValue('appointmentTime', ''); // Clear selected time when inputs change
        try {
          const slots = await getAvailableTimeSlots(
            supabase,
            currentCompanyId,
            selectedCollaboratorId,
            selectedDate,
            totalDurationMinutes,
            totalDurationMinutes // Usar a duração do serviço como intervalo entre slots
          );
          // `slots` vem como horários de início (HH:mm). Vamos montar "HH:mm às HH:mm".
          const formattedSlots = slots.map((startTime) => {
            const [hour, minute] = startTime.split(':').map(Number);
            const startDateTime = new Date(selectedDate);
            startDateTime.setHours(hour, minute, 0, 0);

            const endDateTime = addMinutes(startDateTime, totalDurationMinutes);
            return `${format(startDateTime, 'HH:mm')} às ${format(endDateTime, 'HH:mm')}`;
          });
          setAvailableTimeSlots(formattedSlots);
        } catch (error: any) {
          console.error('Erro ao buscar horários disponíveis:', error);
          showError('Erro ao buscar horários disponíveis: ' + error.message);
          setAvailableTimeSlots([]);
        } finally {
          setLoading(false);
        }
      } else {
        setAvailableTimeSlots([]);
        setValue('appointmentTime', '');
      }
    };
    fetchSlots();
  }, [selectedCollaboratorId, selectedDate, totalDurationMinutes, currentCompanyId, setValue]);


  const onSubmit = async (data: NewAppointmentFormValues) => {
    setLoading(true);
    if (!session?.user || !currentCompanyId) {
      showError('Erro de autenticação ou empresa primária não encontrada.');
      setLoading(false);
      return;
    }

    try {
      // Extract only the start time from the selected slot (e.g., "09:00" from "09:00 às 09:30")
      const startTimeForDb = data.appointmentTime.split(' ')[0];

      // 1. Create the main appointment entry
      const { data: appointmentData, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          company_id: currentCompanyId,
          client_id: data.clientId,
          client_nickname: data.clientNickname, // Save the new nickname field
          collaborator_id: data.collaboratorId,
          appointment_date: data.appointmentDate,
          appointment_time: startTimeForDb, // Use only the start time
          total_duration_minutes: totalDurationMinutes,
          total_price: totalPriceCalculated,
          // payment_method: data.paymentMethod, // REMOVIDO
          observations: data.observations,
          created_by_user_id: session.user.id,
          status: 'pendente', // Default status
        })
        .select()
        .single();

      if (appointmentError) throw appointmentError;

      // 2. Link services to the appointment in appointment_services table
      const appointmentServicesToInsert = data.serviceIds.map(serviceId => ({
        appointment_id: appointmentData.id,
        service_id: serviceId,
        commission_type: commissionByService[serviceId]?.type,
        commission_value: commissionByService[serviceId]?.value ?? null,
      }));

      const { error: servicesLinkError } = await supabase
        .from('appointment_services')
        .insert(appointmentServicesToInsert);

      if (servicesLinkError) throw servicesLinkError;

      // 3. If the client was previously unassociated (company_id is null), associate them now.
      // We use the admin client for this update to bypass RLS if necessary, although the user should have update permission on clients they created.
      const selectedClient = clients.find(c => c.id === data.clientId);
      if (selectedClient) {
        const { data: clientDetails, error: clientDetailsError } = await supabase
          .from('clients')
          .select('company_id')
          .eq('id', data.clientId)
          .single();

        if (clientDetailsError) throw clientDetailsError;

        if (clientDetails.company_id === null) {
          const { error: updateClientError } = await supabase
            .from('clients')
            .update({ company_id: currentCompanyId })
            .eq('id', data.clientId);
          
          if (updateClientError) {
            console.warn('Falha ao associar cliente auto-registrado à empresa:', updateClientError.message);
            // Continue, mas loga o erro
          } else {
            console.log('Cliente auto-registrado associado à empresa primária com sucesso.');
          }
        }
      }


      showSuccess('Agendamento criado com sucesso!');
      navigate(`/agendamentos/${currentCompanyId}`); // Redirect to appointments list
    } catch (error: any) {
      console.error('Erro ao criar agendamento:', error);
      showError('Erro ao criar agendamento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando dados para agendamento...</p>
      </div>
    );
  }

  if (!session?.user || !currentCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-red-500 text-center mb-4">
          Você precisa estar logado e acessar a página com o ID da empresa na URL para criar agendamentos.
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

  const timeSlotButtonBaseClasses =
    "text-sm font-medium border-2 rounded-xl transition-all duration-150 " +
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none " +
    "disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Novo Agendamento</h1>
      </div>
      <div className="max-w-2xl">
        <Card className="border-gray-200">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente *
                  </Label>
                  <Select onValueChange={(value) => setValue('clientId', value, { shouldValidate: true })} value={selectedClientId}>
                    <SelectTrigger id="clientId" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <SelectItem value="no-clients" disabled>Nenhum cliente disponível.</SelectItem>
                      ) : (
                        clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.clientId && <p className="text-red-500 text-xs mt-1">{errors.clientId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="clientNickname" className="block text-sm font-medium text-gray-700 mb-2">
                    Apelido (Opcional)
                  </Label>
                  <Input
                    id="clientNickname"
                    type="text"
                    placeholder="Apelido do cliente"
                    {...register('clientNickname')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.clientNickname && <p className="text-red-500 text-xs mt-1">{errors.clientNickname.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="collaboratorId" className="block text-sm font-medium text-gray-700 mb-2">
                    Colaborador *
                  </Label>
                  <Select onValueChange={(value) => setValue('collaboratorId', value, { shouldValidate: true })} value={selectedCollaboratorId}>
                    <SelectTrigger id="collaboratorId" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <SelectValue placeholder="Selecione o colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      {collaborators.length === 0 ? (
                        <SelectItem value="no-collaborators" disabled>Nenhum profissional disponível.</SelectItem>
                      ) : (
                        collaborators.map((collab) => (
                          <SelectItem key={collab.id} value={collab.id}>
                            {collab.first_name} {collab.last_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.collaboratorId && <p className="text-red-500 text-xs mt-1">{errors.collaboratorId.message}</p>}
                </div>
              </div>
              
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Serviço *
                </Label>
                <Select
                  onValueChange={(value) => {
                    const serviceId = value;
                    setValue('serviceIds', serviceId ? [serviceId] : [], { shouldValidate: true });
                    setValue('appointmentTime', '');
                  }}
                  value={selectedServiceIds[0] || ''}
                  disabled={
                    services.length === 0 ||
                    !selectedCollaboratorId ||
                    allowedServiceIds.length === 0
                  }
                >
                  <SelectTrigger className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <SelectValue
                      placeholder={
                        !selectedCollaboratorId
                          ? 'Selecione um profissional primeiro'
                          : 'Selecione o serviço'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!selectedCollaboratorId ? (
                      <SelectItem value="no-collaborator" disabled>
                        Selecione um profissional primeiro.
                      </SelectItem>
                    ) : services.length === 0 ? (
                      <SelectItem value="no-services" disabled>
                        Nenhum serviço ativo disponível.
                      </SelectItem>
                    ) : allowedServiceIds.length === 0 ? (
                      <SelectItem value="no-allowed" disabled>
                        Nenhum serviço vinculado a este colaborador.
                      </SelectItem>
                    ) : (
                      services
                        .filter((service) => allowedServiceIds.includes(service.id))
                        .map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name} - R$ {service.price.toFixed(2).replace('.', ',')} ({service.duration_minutes} min)
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                {errors.serviceIds && (
                  <p className="text-red-500 text-xs mt-1">{errors.serviceIds.message}</p>
                )}
                {totalDurationMinutes > 0 && (
                  <p className="text-sm text-gray-600 mt-2">
                    Duração total: {totalDurationMinutes} min | Preço total: R$ {totalPriceCalculated.toFixed(2).replace('.', ',')}
                  </p>
                )}
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Data e Hora *
                </Label>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl shadow-sm p-4 md:p-6">
                  <div className="flex flex-col gap-6">
                    <div className="flex justify-center">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setValue(
                            "appointmentDate",
                            date ? format(date, "yyyy-MM-dd") : "",
                            { shouldValidate: true }
                          );
                        }}
                        initialFocus
                        locale={ptBR}
                        disabled={(date) => isBefore(date, startOfDay(new Date()))}
                        className="rounded-2xl border-2 border-yellow-500 bg-white shadow-sm p-2"
                      />
                    </div>
                    {errors.appointmentDate && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.appointmentDate.message}
                      </p>
                    )}
                    <div>
                      <Label
                        htmlFor="appointmentTime"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        Horário *
                      </Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {loading ? (
                          <p className="text-gray-500 col-span-full text-center">
                            Buscando horários...
                          </p>
                        ) : availableTimeSlots.length > 0 ? (
                          availableTimeSlots.map((timeSlot) => (
                            <Button
                              key={timeSlot}
                              type="button"
                              variant="outline"
                              className={
                                timeSlotButtonBaseClasses +
                                " " +
                                (selectedAppointmentTime === timeSlot
                                  ? "bg-yellow-600 text-black border-yellow-700 shadow-[0_3px_0_0_rgba(202,138,4,1)]"
                                  : "bg-white text-yellow-700 border-yellow-500 shadow-[0_2px_0_0_rgba(202,138,4,1)] hover:-translate-y-0.5 hover:bg-yellow-50 hover:shadow-[0_4px_0_0_rgba(202,138,4,1)]")
                              }
                              onClick={() =>
                                setValue("appointmentTime", timeSlot, {
                                  shouldValidate: true,
                                })
                              }
                              disabled={
                                !selectedCollaboratorId ||
                                !selectedDate ||
                                totalDurationMinutes === 0
                              }
                            >
                              {timeSlot}
                            </Button>
                          ))
                        ) : selectedDate &&
                          selectedCollaboratorId &&
                          totalDurationMinutes > 0 ? (
                          <p className="text-gray-500 col-span-full text-center">
                            Nenhum horário disponível para a data, colaborador e
                            serviço selecionados.
                          </p>
                        ) : (
                          <p className="text-gray-500 col-span-full text-center">
                            Selecione colaborador, serviço e data para ver os
                            horários.
                          </p>
                        )}
                      </div>
                      {errors.appointmentTime && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.appointmentTime.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <Label htmlFor="observations" className="block text-sm font-medium text-gray-700 mb-2">
                  Observações
                </Label>
                <Textarea
                  id="observations"
                  maxLength={500}
                  {...register('observations')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-24 resize-none"
                  placeholder="Observações sobre o agendamento..."
                ></Textarea>
                {errors.observations && <p className="text-red-500 text-xs mt-1">{errors.observations.message}</p>}
              </div>
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="!rounded-button whitespace-nowrap cursor-pointer flex-1"
                  onClick={() => navigate(-1)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="!rounded-button whitespace-nowrap cursor-pointer bg-yellow-600 hover:bg-yellow-700 text-black flex-1"
                  disabled={loading || !selectedCollaboratorId || !selectedDate || totalDurationMinutes === 0 || availableTimeSlots.length === 0}
                >
                  {loading ? 'Agendando...' : 'Agendar'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NovoAgendamentoPage;