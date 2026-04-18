import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { X, ArrowLeft } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { Calendar } from "@/components/ui/calendar";
import { format, addMinutes, startOfDay, isBefore, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getAvailableTimeSlots } from '@/utils/appointment-scheduling';
import { checkWhatsAppMenuAccess } from '@/utils/checkWhatsAppMenuAccess'; // Importar verificação de acesso ao menu WhatsApp

// Zod schema for new appointment registration
const clientAppointmentSchema = z.object({
  collaboratorId: z.string().min(1, "Colaborador é obrigatório."),
  serviceIds: z.array(z.string()).min(1, "Selecione pelo menos um serviço."),
  appointmentDate: z.string().min(1, "Data é obrigatória."),
  appointmentTime: z.string().min(1, "Horário é obrigatório."),
  observations: z.string().max(500, "Máximo de 500 caracteres.").optional(),
});

type ClientAppointmentFormValues = z.infer<typeof clientAppointmentSchema>;

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

interface ClientAppointmentFormProps {
  companyId: string;
}

const ClientAppointmentForm: React.FC<ClientAppointmentFormProps> = ({ companyId }) => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const [loading, setLoading] = useState(false); // For form submission
  const [clientContext, setClientContext] = useState<{ clientId: string; clientName: string } | null>(null);
  // const [targetCompanyId, setTargetCompanyIdState] = useState<string | null>(null); // REMOVIDO: companyId vem da prop
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [services, setServices] = useState<Service[]>([]); // Serviços disponíveis para o agendamento
  const [loadingData, setLoadingData] = useState(true); // For initial data fetch
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [totalDurationMinutes, setTotalDurationMinutes] = useState(0);
  const [totalPriceCalculated, setTotalPriceCalculated] = useState(0);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<ClientAppointmentFormValues>({
    resolver: zodResolver(clientAppointmentSchema),
    defaultValues: {
      collaboratorId: '',
      serviceIds: [],
      appointmentDate: '',
      appointmentTime: '',
      observations: '',
    },
  });

  const selectedCollaboratorId = watch('collaboratorId');
  const selectedServiceIds = watch('serviceIds');
  const selectedAppointmentTime = watch('appointmentTime');

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


  const fetchInitialData = useCallback(async () => {
    if (sessionLoading || !session?.user) {
      return;
    }

    setLoadingData(true);
    try {
      // 1. Get the client's profile data (or create it if missing)
      const clientData = await createClientProfileIfMissing(session.user.id);
      setClientContext({ 
        clientId: clientData.clientId, 
        clientName: clientData.clientName 
      });

      // O companyId agora vem das props, não do storage.
      if (!companyId) {
        throw new Error('ID da empresa não fornecido para o agendamento.');
      }
      // Não precisamos setar targetCompanyIdState pois usamos a prop companyId diretamente.

      // 3. Fetch Collaborators for the selected company - apenas profissionais com função "Colaborador"
      const { data: collaboratorsData, error: collaboratorsError } = await supabase
        .from('collaborators')
        .select(`
          id,
          first_name,
          last_name,
          role_type_id,
          role_types(description)
        `)
        .eq('company_id', companyId)
        .eq('status', 'Ativo')
        .eq('is_arena_system_placeholder', false)
        .order('first_name', { ascending: true });

      if (collaboratorsError) throw collaboratorsError;

      const professionalCollaborators = (collaboratorsData || []).filter((col: any) => {
        const roleDescription = (col.role_types as { description?: string } | null)?.description || '';
        return roleDescription.toLowerCase().includes('colaborador');
      });

      const mappedCollaborators = professionalCollaborators.map((col: any) => ({
        id: col.id,
        first_name: col.first_name,
        last_name: col.last_name,
      }));

      setCollaborators(mappedCollaborators);
      console.log('ClientAppointmentForm: Fetched collaborators count (filtered by role=Colaborador):', mappedCollaborators.length); // LOG ADDED

      // 4. Services serão carregados apenas quando um colaborador for selecionado
      // Não carregamos todos os serviços aqui para evitar lista grande
      setServices([]);

      // 5. Clear the target ID from storage is no longer needed here as it's not stored here.

    } catch (error: any) {
      console.error('Erro ao carregar dados iniciais para agendamento do cliente:', error);
      showError('Erro ao carregar dados: ' + error.message);
      navigate('/meus-agendamentos'); // Redirect to list if setup fails
    } finally {
      setLoadingData(false);
    }
  }, [session, sessionLoading, navigate, createClientProfileIfMissing, companyId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Carrega serviços disponíveis para o colaborador selecionado,
  // filtrando pela tabela collaborator_services para não permitir
  // que o cliente marque um serviço que o colaborador não realiza.
  useEffect(() => {
    const loadAllowed = async () => {
      if (!selectedCollaboratorId || !companyId) {
        setServices([]);
        setValue('serviceIds', [], { shouldValidate: true });
        return;
      }

      try {
        console.log('ClientAppointmentForm.loadAllowed: buscando serviços para colaborador', {
          companyId,
          selectedCollaboratorId,
        });

        // 1) Buscar IDs de serviços permitidos na collaborator_services
        const { data: collaboratorServices, error: collaboratorServicesError } = await supabase
          .from('collaborator_services')
          .select('service_id')
          .eq('company_id', companyId)
          .eq('collaborator_id', selectedCollaboratorId)
          .eq('active', true);

        if (collaboratorServicesError) {
          console.error('ClientAppointmentForm.loadAllowed: erro ao buscar collaborator_services:', collaboratorServicesError);
          showError('Erro ao carregar serviços disponíveis para o colaborador.');
          setServices([]);
          setValue('serviceIds', [], { shouldValidate: true });
          return;
        }

        const allowedServiceIds = (collaboratorServices || []).map((cs: any) => cs.service_id);
        console.log('ClientAppointmentForm.loadAllowed: allowedServiceIds =', allowedServiceIds);

        if (allowedServiceIds.length === 0) {
          console.log('ClientAppointmentForm.loadAllowed: nenhum serviço vinculado a este colaborador.');
          setServices([]);
          setValue('serviceIds', [], { shouldValidate: true });
          return;
        }

        // 2) Buscar apenas os serviços permitidos
        const { data: servicesData, error: servicesError } = await supabase
          .from('services')
          .select('id, name, price, duration_minutes')
          .eq('company_id', companyId)
          .eq('status', 'Ativo')
          .eq('is_arena_system_service_placeholder', false)
          .in('id', allowedServiceIds)
          .order('name', { ascending: true });

        if (servicesError) {
          console.error('ClientAppointmentForm.loadAllowed: erro ao carregar serviços filtrados:', servicesError);
          showError('Erro ao carregar serviços disponíveis.');
          setServices([]);
          setValue('serviceIds', [], { shouldValidate: true });
          return;
        }

        console.log('ClientAppointmentForm.loadAllowed: serviços carregados para o colaborador:', servicesData);
        setServices(servicesData || []);

        // Limpa serviços selecionados que não existem mais
        const currentServiceIds = getValues('serviceIds');
        const validIds = new Set((servicesData || []).map((s: any) => s.id));
        const filteredServiceIds = currentServiceIds.filter((id) => validIds.has(id));
        if (filteredServiceIds.length !== currentServiceIds.length) {
          setValue('serviceIds', filteredServiceIds, { shouldValidate: true });
        }
      } catch (err: any) {
        console.error('ClientAppointmentForm.loadAllowed: erro inesperado ao carregar serviços:', err);
        showError('Erro ao carregar serviços disponíveis.');
        setServices([]);
        setValue('serviceIds', [], { shouldValidate: true });
      }
    };
    loadAllowed();
  }, [selectedCollaboratorId, companyId, getValues, setValue]);

  // Effect to calculate total duration and price when services change
  useEffect(() => {
    const selected = services.filter(s => selectedServiceIds.includes(s.id));
    const duration = selected.reduce((sum, service) => sum + service.duration_minutes, 0);
    const price = selected.reduce((sum, service) => sum + service.price, 0);
    setTotalDurationMinutes(duration);
    setTotalPriceCalculated(price);
  }, [selectedServiceIds, services]);

  // Effect to fetch available time slots (sempre buscar dados atualizados)
  useEffect(() => {
    const fetchSlots = async () => {
      if (selectedCollaboratorId && selectedDate && totalDurationMinutes > 0 && companyId) {
        setLoading(true);
        setValue('appointmentTime', ''); // Clear selected time when inputs change
        try {
          console.log('ClientAppointmentForm: Buscando slots atualizados em:', new Date().toISOString());
          // Normalizar a data para garantir que está no início do dia - usar componentes locais
          const normalizedSelectedDate = selectedDate ? (() => {
            const year = selectedDate.getFullYear();
            const month = selectedDate.getMonth();
            const day = selectedDate.getDate();
            return new Date(year, month, day, 0, 0, 0, 0);
          })() : undefined;
          console.log('ClientAppointmentForm: selectedDate:', selectedDate, 'formatted:', selectedDate ? format(selectedDate, 'yyyy-MM-dd') : 'null');
          console.log('ClientAppointmentForm: normalizedSelectedDate:', normalizedSelectedDate, 'formatted:', normalizedSelectedDate ? format(normalizedSelectedDate, 'yyyy-MM-dd') : 'null', 'ISO:', normalizedSelectedDate?.toISOString());
          if (!normalizedSelectedDate) return;
          const slots = await getAvailableTimeSlots(
            supabase,
            companyId,
            selectedCollaboratorId,
            normalizedSelectedDate,
            totalDurationMinutes,
            totalDurationMinutes // Usar a duração do serviço como intervalo entre slots
          );
          console.log('ClientAppointmentForm: Slots recebidos do backend:', slots);
          // `slots` vem como horários de início (HH:mm). Vamos montar "HH:mm às HH:mm" para exibição.
          const formattedSlots = slots.map((startTime) => {
            const [hour, minute] = startTime.split(':').map(Number);
            // Usar a data normalizada para criar os horários
            const startDateTime = new Date(normalizedSelectedDate);
            startDateTime.setHours(hour, minute, 0, 0);

            const endDateTime = addMinutes(startDateTime, totalDurationMinutes);
            return `${format(startDateTime, 'HH:mm')} às ${format(endDateTime, 'HH:mm')}`;
          });
          console.log('ClientAppointmentForm: Slots formatados para exibição:', formattedSlots);
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
  }, [selectedCollaboratorId, selectedDate, totalDurationMinutes, companyId, setValue]);


  const handleAddService = (serviceId: string) => {
    if (!selectedServiceIds.includes(serviceId)) {
      setValue('serviceIds', [...selectedServiceIds, serviceId], { shouldValidate: true });
    }
  };

  const handleRemoveService = (serviceId: string) => {
    setValue('serviceIds', selectedServiceIds.filter((id) => id !== serviceId), { shouldValidate: true });
  };

  const onSubmit = async (data: ClientAppointmentFormValues) => {
    setLoading(true);
    if (!session?.user || !clientContext?.clientId || !companyId) {
      showError('Erro de autenticação ou dados do cliente/empresa faltando.');
      setLoading(false);
      return;
    }

    try {
      // Re-validar slots disponíveis antes de enviar (para evitar race conditions)
      if (data.collaboratorId && data.appointmentDate && totalDurationMinutes > 0) {
        try {
          // Normalizar a data da mesma forma que foi normalizada antes
          const appointmentDateObj = parse(data.appointmentDate, 'yyyy-MM-dd', new Date());
          const normalizedAppointmentDate = (() => {
            const year = appointmentDateObj.getFullYear();
            const month = appointmentDateObj.getMonth();
            const day = appointmentDateObj.getDate();
            return new Date(year, month, day, 0, 0, 0, 0);
          })();
          
          console.log('Re-validando slots - appointmentDate:', data.appointmentDate, 'normalized:', format(normalizedAppointmentDate, 'yyyy-MM-dd'));
          
          const refreshedSlots = await getAvailableTimeSlots(
            supabase,
            companyId,
            data.collaboratorId,
            normalizedAppointmentDate,
            totalDurationMinutes,
            totalDurationMinutes // Usar a duração do serviço como intervalo entre slots
          );
          
          console.log('Re-validação - refreshedSlots recebidos:', refreshedSlots);
          
          // Formatar slots como "HH:mm às HH:mm" (mesmo formato usado na exibição)
          const formattedRefreshedSlots = refreshedSlots.map((startTime) => {
            const [hour, minute] = startTime.split(':').map(Number);
            const startDateTime = new Date(normalizedAppointmentDate);
            startDateTime.setHours(hour, minute, 0, 0);
            const endDateTime = addMinutes(startDateTime, totalDurationMinutes);
            return `${format(startDateTime, 'HH:mm')} às ${format(endDateTime, 'HH:mm')}`;
          });
          
          console.log('Re-validação - formattedRefreshedSlots:', formattedRefreshedSlots);
          console.log('Re-validação - slot selecionado pelo usuário:', data.appointmentTime);
          console.log('Re-validação - slot está na lista?', formattedRefreshedSlots.includes(data.appointmentTime));
          
          // Verificar se o slot selecionado ainda está disponível
          if (!formattedRefreshedSlots.includes(data.appointmentTime)) {
            console.warn('Re-validação: Slot não encontrado na lista atualizada');
            // Atualizar lista de slots disponíveis
            setAvailableTimeSlots(formattedRefreshedSlots);
            setValue('appointmentTime', '');
            showError('O horário selecionado não está mais disponível. Por favor, escolha outro horário da lista atualizada.');
            setLoading(false);
            return;
          }
        } catch (refreshError) {
          console.warn('Erro ao re-validar slots (continuando mesmo assim):', refreshError);
          // Continua mesmo se a re-validação falhar
        }
      }
      
      // Extrair apenas o horário de início do slot selecionado (ex: "22:00" de "22:00 às 22:30")
      const startTimeForDb = data.appointmentTime.includes(' às ') 
        ? data.appointmentTime.split(' às ')[0].trim()
        : data.appointmentTime.includes(' ')
        ? data.appointmentTime.split(' ')[0].trim()
        : data.appointmentTime.trim();
      
      console.log('ClientAppointmentForm: Criando agendamento diretamente no banco');
      console.log('ClientAppointmentForm: appointmentTime original:', data.appointmentTime);
      console.log('ClientAppointmentForm: startTimeForDb extraído:', startTimeForDb);
      console.log('ClientAppointmentForm: totalDurationMinutes:', totalDurationMinutes);
      
      // Extract only the first name from the full client name
      const clientFirstName = clientContext.clientName.split(' ')[0];

      // Criar agendamento diretamente no banco (mesma lógica do NovoAgendamentoPage)
      // 1. Criar o registro principal em appointments
      const { data: appointmentData, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          company_id: companyId,
          client_id: clientContext.clientId,
          client_nickname: clientFirstName,
          collaborator_id: data.collaboratorId,
          appointment_date: data.appointmentDate,
          appointment_time: startTimeForDb,
          total_duration_minutes: totalDurationMinutes,
          total_price: totalPriceCalculated,
          observations: data.observations || '',
          created_by_user_id: session.user.id,
          status: 'pendente', // Default status for new client appointments
        })
        .select()
        .single();

      if (appointmentError) {
        console.error('Erro ao criar agendamento:', appointmentError);
        throw appointmentError;
      }

      // 2. Vincular serviços ao agendamento na tabela appointment_services
      const appointmentServicesToInsert = data.serviceIds.map((serviceId: string) => ({
        appointment_id: appointmentData.id,
        service_id: serviceId,
      }));

      const { error: servicesLinkError } = await supabase
        .from('appointment_services')
        .insert(appointmentServicesToInsert);

      if (servicesLinkError) {
        console.error('Erro ao vincular serviços ao agendamento:', servicesLinkError);
        // Tentar remover o agendamento criado se a vinculação falhar
        await supabase.from('appointments').delete().eq('id', appointmentData.id);
        throw servicesLinkError;
      }

      showSuccess('Agendamento criado com sucesso!');
      navigate('/meus-agendamentos'); // Redirect to client's appointments list
    } catch (error: any) {
      console.error('Erro ao criar agendamento:', error);
      showError('Erro ao criar agendamento: ' + (error.message || 'Erro desconhecido.'));
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

  if (!session?.user || !clientContext || !companyId) {
    // If clientContext or companyId is null here, it means fetchInitialData failed to find the client profile or company association.
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-red-500 text-center mb-4">
          Não foi possível carregar seu perfil de cliente ou empresa associada. Por favor, tente novamente ou entre em contato com o suporte.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/meus-agendamentos')} // Navigate back to client's list
        >
          <i className="fas fa-sign-in-alt mr-2"></i>
          Voltar para Meus Agendamentos
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
          onClick={() => navigate('/meus-agendamentos')} // Navigate back to client's list
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Novo Agendamento</h1>
      </div>
      <div className="max-w-4xl">
        <Card className="border-gray-200">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  Serviços *
                </Label>
                <Select
                  onValueChange={handleAddService}
                  value=""
                  disabled={!selectedCollaboratorId || services.length === 0}
                >
                  <SelectTrigger className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <SelectValue placeholder={!selectedCollaboratorId ? "Selecione um colaborador primeiro" : services.length === 0 ? "Nenhum serviço disponível" : "Selecione um serviço"} />
                  </SelectTrigger>
                  <SelectContent>
                    {!selectedCollaboratorId ? (
                      <SelectItem value="no-collaborator" disabled>
                        Selecione um colaborador primeiro
                      </SelectItem>
                    ) : services.length === 0 ? (
                      <SelectItem value="no-services" disabled>
                        Nenhum serviço disponível para este colaborador
                      </SelectItem>
                    ) : (
                      services
                        .filter((service) => !selectedServiceIds.includes(service.id))
                        .map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name} - R$ {service.price.toFixed(2).replace('.', ',')} ({service.duration_minutes} min)
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                
                {/* Lista de serviços selecionados */}
                {selectedServiceIds.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedServiceIds.map((serviceId) => {
                      const service = services.find((s) => s.id === serviceId);
                      if (!service) return null;
                      return (
                        <div
                          key={serviceId}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-900">{service.name}</span>
                            <span className="text-xs text-gray-600 ml-2">
                              R$ {service.price.toFixed(2).replace('.', ',')} • {service.duration_minutes} min
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveService(serviceId)}
                            className="h-6 w-6 p-0 text-gray-500 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!selectedCollaboratorId && (
                  <p className="text-sm text-gray-600 mt-2">Selecione um colaborador para ver os serviços.</p>
                )}
                {selectedCollaboratorId && services.length === 0 && (
                  <p className="text-sm text-red-500 mt-2">Nenhum serviço disponível para esta empresa.</p>
                )}
                {errors.serviceIds && <p className="text-red-500 text-xs mt-1">{errors.serviceIds.message}</p>}
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
                          // Normalizar a data imediatamente ao selecionar para evitar problemas de timezone
                          // Usar componentes locais para preservar a data correta
                          const normalizedDate = date
                            ? (() => {
                                const year = date.getFullYear();
                                const month = date.getMonth();
                                const day = date.getDate();
                                return new Date(year, month, day, 0, 0, 0, 0);
                              })()
                            : undefined;
                          console.log(
                            "ClientAppointmentForm: Date selected:",
                            date,
                            "normalized:",
                            normalizedDate,
                            "formatted:",
                            normalizedDate ? format(normalizedDate, "yyyy-MM-dd") : "null",
                            "ISO:",
                            normalizedDate?.toISOString()
                          );
                          setSelectedDate(normalizedDate);
                          setValue(
                            "appointmentDate",
                            normalizedDate ? format(normalizedDate, "yyyy-MM-dd") : "",
                            { shouldValidate: true }
                          );
                        }}
                        initialFocus
                        locale={ptBR}
                        disabled={(date) => isBefore(date, startOfDay(new Date()))}
                        className="rounded-2xl border-2 border-primary bg-white shadow-sm p-2"
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
                      {loading ? (
                        <p className="text-gray-500 text-center py-4">
                          Buscando horários disponíveis...
                        </p>
                      ) : availableTimeSlots.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-4">
                          {!selectedCollaboratorId || !selectedDate || totalDurationMinutes === 0
                            ? "Selecione colaborador, serviços e data para ver os horários disponíveis"
                            : "Nenhum horário disponível para esta data"}
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {availableTimeSlots.map((timeSlot) => {
                            const isSelected = selectedAppointmentTime === timeSlot;

                            return (
                              <Button
                                key={timeSlot}
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  setValue("appointmentTime", timeSlot, {
                                    shouldValidate: true,
                                  })
                                }
                                className={
                                  timeSlotButtonBaseClasses +
                                  " " +
                                  (isSelected
                                    ? "bg-primary text-primary-foreground border-primary shadow-[0_3px_0_0_rgba(202,138,4,1)]"
                                    : "bg-white text-primary border-primary shadow-[0_2px_0_0_rgba(202,138,4,1)] hover:-translate-y-0.5 hover:bg-primary/10 hover:shadow-[0_4px_0_0_rgba(202,138,4,1)]")
                                }
                                disabled={
                                  !selectedCollaboratorId ||
                                  !selectedDate ||
                                  totalDurationMinutes === 0
                                }
                              >
                                {timeSlot}
                              </Button>
                            );
                          })}
                        </div>
                      )}
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
                  onClick={() => navigate('/meus-agendamentos')} // Navigate back to client's list
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
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

export default ClientAppointmentForm;