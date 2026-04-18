import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, addMinutes, parse } from 'date-fns'; // Adicionado addMinutes e parse
import { ptBR } from 'date-fns/locale';
import { getAvailableTimeSlots } from '@/utils/appointment-scheduling';
import {
  CourtReservationEditForm,
  type CourtAppointmentRow,
} from '@/components/CourtReservationEditForm';

// Zod schema for appointment editing
const editAppointmentSchema = z.object({
  clientId: z.string().min(1, "Cliente é obrigatório."),
  clientNickname: z.string().optional(), // Novo campo de apelido
  collaboratorId: z.string().min(1, "Colaborador é obrigatório."),
  serviceIds: z.array(z.string()).min(1, "Selecione pelo menos um serviço."),
  appointmentDate: z.string().min(1, "Data é obrigatória."),
  appointmentTime: z.string().min(1, "Horário é obrigatório."),
  observations: z.string().max(500, "Máximo de 500 caracteres.").optional(),
  status: z.enum(['pendente', 'confirmado', 'cancelado', 'concluido'], {
    errorMap: () => ({ message: "O status é obrigatório." })
  }),
});

type EditAppointmentFormValues = z.infer<typeof editAppointmentSchema>;

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

const EditAgendamentoPage: React.FC = () => {
  const navigate = useNavigate();
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [loading, setLoading] = useState(false); // For form submission
  const [clients, setClients] = useState<Client[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [allowedServiceIds, setAllowedServiceIds] = useState<string[]>([]);
  const [commissionByService, setCommissionByService] = useState<Record<string, { type?: string; value?: number }>>({});
  const [loadingData, setLoadingData] = useState(true); // For initial data fetch
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [totalDurationMinutes, setTotalDurationMinutes] = useState(0);
  const [totalPriceCalculated, setTotalPriceCalculated] = useState(0);
  const [isCourtBooking, setIsCourtBooking] = useState(false);
  const [courtAppointment, setCourtAppointment] = useState<CourtAppointmentRow | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditAppointmentFormValues>({
    resolver: zodResolver(editAppointmentSchema),
    defaultValues: {
      clientId: '',
      clientNickname: '', // Default value for new field
      collaboratorId: '',
      serviceIds: [],
      appointmentDate: '',
      appointmentTime: '',
      observations: '',
      status: 'pendente',
    },
  });

  const selectedClientId = watch('clientId');
  const selectedClientNickname = watch('clientNickname'); // Watch new field
  const selectedCollaboratorId = watch('collaboratorId');
  const selectedServiceIds = watch('serviceIds');
  const selectedAppointmentTime = watch('appointmentTime');
  const selectedStatus = watch('status');

  const fetchInitialData = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany || !primaryCompanyId) {
      return;
    }

    setLoadingData(true);
    try {
      setIsCourtBooking(false);
      setCourtAppointment(null);

      if (!appointmentId) {
        setLoadingData(false);
        return;
      }

      const { data: appointmentData, error: appointmentError } = await supabase
        .from('appointments')
        .select(`
          id,
          booking_kind,
          court_id,
          client_id,
          client_nickname,
          collaborator_id,
          appointment_date,
          appointment_time,
          total_duration_minutes,
          total_price,
          payment_method,
          mp_payment_id,
          mp_payment_status,
          observations,
          status,
          appointment_services(service_id),
          courts(name)
        `)
        .eq('id', appointmentId)
        .eq('company_id', primaryCompanyId)
        .single();

      if (appointmentError) throw appointmentError;

      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('company_id', primaryCompanyId)
        .order('name', { ascending: true });

      if (clientsError) throw clientsError;
      setClients(clientsData || []);

      if (appointmentData.booking_kind === 'court') {
        const rel = (appointmentData as { courts?: { name: string } | { name: string }[] | null }).courts;
        const courtObj = Array.isArray(rel) ? rel[0] ?? null : rel ?? null;
        setIsCourtBooking(true);
        setCourtAppointment({ ...appointmentData, courts: courtObj } as CourtAppointmentRow);
        setLoadingData(false);
        return;
      }

      setIsCourtBooking(false);
      setCourtAppointment(null);

      const { data: collaboratorsData, error: collaboratorsError } = await supabase
        .from('collaborators')
        .select('id, first_name, last_name')
        .eq('company_id', primaryCompanyId)
        .eq('is_arena_system_placeholder', false)
        .order('first_name', { ascending: true });

      if (collaboratorsError) throw collaboratorsError;
      setCollaborators(collaboratorsData);

      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name, price, duration_minutes')
        .eq('company_id', primaryCompanyId)
        .eq('status', 'Ativo')
        .eq('is_arena_system_service_placeholder', false)
        .order('name', { ascending: true });

      if (servicesError) throw servicesError;
      setServices(servicesData);

      const parsedDate = parseISO(appointmentData.appointment_date);
      setSelectedDate(parsedDate);

      const currentServiceIds = (appointmentData.appointment_services || []).map((as: any) => as.service_id);

      reset({
        clientId: appointmentData.client_id,
        clientNickname: appointmentData.client_nickname || '',
        collaboratorId: appointmentData.collaborator_id,
        serviceIds: currentServiceIds,
        appointmentDate: appointmentData.appointment_date,
        appointmentTime: `${appointmentData.appointment_time.substring(0, 5)} às ${format(addMinutes(parse(appointmentData.appointment_time.substring(0, 5), 'HH:mm', parsedDate), appointmentData.total_duration_minutes), 'HH:mm')}`,
        observations: appointmentData.observations || '',
        status: appointmentData.status as 'pendente' | 'confirmado' | 'cancelado' | 'concluido',
      });
      setTotalDurationMinutes(appointmentData.total_duration_minutes);
      setTotalPriceCalculated(appointmentData.total_price);

    } catch (error: any) {
      console.error('Erro ao carregar dados iniciais ou agendamento:', error);
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoadingData(false);
    }
  }, [sessionLoading, loadingPrimaryCompany, primaryCompanyId, appointmentId, reset]);

  useEffect(() => {
    if (!session && !sessionLoading) {
      showError('Você precisa estar logado para gerenciar agendamentos.');
      navigate('/login');
    }
    if (!primaryCompanyId && !loadingPrimaryCompany && session) {
      showError('Você precisa ter uma empresa primária cadastrada para gerenciar agendamentos.');
      navigate('/register-company');
    }
    fetchInitialData();
  }, [session, sessionLoading, primaryCompanyId, loadingPrimaryCompany, navigate, fetchInitialData]);

  // Carrega serviços permitidos para o colaborador selecionado.
  // Para não quebrar agendamentos antigos, mantemos serviços já selecionados mesmo que não estejam mais permitidos.
  useEffect(() => {
    if (isCourtBooking) return;
    const loadAllowed = async () => {
      if (!selectedCollaboratorId || !primaryCompanyId) {
        setAllowedServiceIds([]);
        return;
      }
      const { data, error } = await supabase
        .from('collaborator_services')
        .select('service_id, commission_type, commission_value')
        .eq('company_id', primaryCompanyId)
        .eq('collaborator_id', selectedCollaboratorId)
        .eq('active', true);
      if (error) {
        console.error('Erro ao carregar serviços permitidos:', error);
        showError('Erro ao carregar serviços permitidos para o colaborador.');
        setAllowedServiceIds([]);
        return;
      }
      const ids = (data || []).map((d: any) => d.service_id);
      const commissionMap = (data || []).reduce<Record<string, { type?: string; value?: number }>>((acc, cur: any) => {
        acc[cur.service_id] = { type: cur.commission_type, value: cur.commission_value };
        return acc;
      }, {});
      setCommissionByService(commissionMap);
      // Mantém os já selecionados mesmo que não estejam mais permitidos, para edição de legado.
      const merged = Array.from(new Set([...ids, ...selectedServiceIds]));
      setAllowedServiceIds(merged);
      setValue(
        'serviceIds',
        selectedServiceIds.filter((id) => merged.includes(id)),
        { shouldValidate: true }
      );
    };
    loadAllowed();
  }, [isCourtBooking, selectedCollaboratorId, primaryCompanyId, selectedServiceIds, setValue]);

  // Effect to calculate total duration and price when services change
  useEffect(() => {
    if (isCourtBooking) return;
    const selected = services.filter(s => selectedServiceIds.includes(s.id));
    const duration = selected.reduce((sum, service) => sum + service.duration_minutes, 0);
    const price = selected.reduce((sum, service) => sum + service.price, 0);
    setTotalDurationMinutes(duration);
    setTotalPriceCalculated(price);
  }, [isCourtBooking, selectedServiceIds, services]);

  // Effect to fetch available time slots
  useEffect(() => {
    if (isCourtBooking) return;
    const fetchSlots = async () => {
      if (selectedCollaboratorId && selectedDate && totalDurationMinutes > 0 && primaryCompanyId) {
        setLoading(true);
        try {
          const slots = await getAvailableTimeSlots(
            supabase,
            primaryCompanyId,
            selectedCollaboratorId,
            selectedDate,
            totalDurationMinutes,
            totalDurationMinutes, // Usar a duração do serviço como intervalo entre slots
            appointmentId // Pass the current appointment ID to exclude it from busy slots
          );

          // Converte horários de início (HH:mm) para "HH:mm às HH:mm"
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
      }
    };
    fetchSlots();
  }, [isCourtBooking, selectedCollaboratorId, selectedDate, totalDurationMinutes, primaryCompanyId, setValue, appointmentId]);


  const handleServiceChange = (serviceId: string, checked: boolean) => {
    let currentServices = selectedServiceIds;
    if (checked) {
      currentServices = [...currentServices, serviceId];
    } else {
      currentServices = currentServices.filter((id) => id !== serviceId);
    }
    setValue('serviceIds', currentServices, { shouldValidate: true });
  };

  const onSubmit = async (data: EditAppointmentFormValues) => {
    setLoading(true);
    if (!session?.user || !primaryCompanyId || !appointmentId) {
      showError('Erro de autenticação ou dados da empresa/agendamento faltando.');
      setLoading(false);
      return;
    }

    try {
      const startTimeForDb = data.appointmentTime.split(' ')[0];

      // 1. Update the main appointment entry
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({
          client_id: data.clientId,
          client_nickname: data.clientNickname, // Save the new nickname field
          collaborator_id: data.collaboratorId,
          appointment_date: data.appointmentDate,
          appointment_time: startTimeForDb,
          total_duration_minutes: totalDurationMinutes,
          total_price: totalPriceCalculated,
          observations: data.observations,
          status: data.status,
        })
        .eq('id', appointmentId)
        .eq('company_id', primaryCompanyId);

      if (appointmentError) throw appointmentError;

      // 2. Update linked services in appointment_services table
      // First, delete all existing services for this appointment
      const { error: deleteServicesError } = await supabase
        .from('appointment_services')
        .delete()
        .eq('appointment_id', appointmentId);

      if (deleteServicesError) throw deleteServicesError;

      // Then, insert the newly selected services
      const appointmentServicesToInsert = data.serviceIds.map(serviceId => ({
        appointment_id: appointmentId,
        service_id: serviceId,
        commission_type: commissionByService[serviceId]?.type,
        commission_value: commissionByService[serviceId]?.value ?? null,
      }));

      const { error: insertServicesError } = await supabase
        .from('appointment_services')
        .insert(appointmentServicesToInsert);

      if (insertServicesError) throw insertServicesError;

      showSuccess('Agendamento atualizado com sucesso!');
      navigate(`/agendamentos/${primaryCompanyId}`);
    } catch (error: any) {
      console.error('Erro ao atualizar agendamento:', error);
      showError('Erro ao atualizar agendamento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading || loadingPrimaryCompany || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando dados do agendamento...</p>
      </div>
    );
  }

  if (!session?.user || !primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-red-500 text-center mb-4">
          Você precisa estar logado e ter uma empresa primária para gerenciar agendamentos.
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

  if (isCourtBooking && courtAppointment) {
    return (
      <CourtReservationEditForm
        appointment={courtAppointment}
        clients={clients}
        primaryCompanyId={primaryCompanyId}
        onSuccess={() => navigate(`/agendamentos/${primaryCompanyId}`)}
        onBack={() => navigate(-1)}
      />
    );
  }

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
        <h1 className="text-3xl font-bold text-gray-900">Editar Agendamento</h1>
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
                        <SelectItem value="no-collaborators" disabled>Nenhum colaborador disponível.</SelectItem>
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
                  disabled={services.length === 0 || allowedServiceIds.length === 0}
                >
                  <SelectTrigger className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.length === 0 ? (
                      <SelectItem value="no-services" disabled>
                        Nenhum serviço ativo disponível.
                      </SelectItem>
                    ) : allowedServiceIds.length === 0 ? (
                      <SelectItem value="no-allowed" disabled>
                        Nenhum serviço permitido para este colaborador.
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
                {errors.serviceIds && <p className="text-red-500 text-xs mt-1">{errors.serviceIds.message}</p>}
                {totalDurationMinutes > 0 && (
                  <p className="text-sm text-gray-600 mt-2">
                    Duração total: {totalDurationMinutes} min | Preço total: R$ {totalPriceCalculated.toFixed(2).replace('.', ',')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="appointmentDate" className="block text-sm font-medium text-gray-700 mb-2">
                    Data *
                  </Label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setValue('appointmentDate', date ? format(date, 'yyyy-MM-dd') : '', { shouldValidate: true });
                    }}
                    initialFocus
                    locale={ptBR}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} // Disable past dates
                    className="rounded-md border shadow w-full"
                  />
                  {errors.appointmentDate && <p className="text-red-500 text-xs mt-1">{errors.appointmentDate.message}</p>}
                </div>
                <div>
                  <Label htmlFor="appointmentTime" className="block text-sm font-medium text-gray-700 mb-2">
                    Horário *
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {loading ? (
                      <p className="text-gray-500 col-span-3 text-center">Buscando horários...</p>
                    ) : availableTimeSlots.length > 0 ? (
                      availableTimeSlots.map((timeSlot) => (
                        <Button
                          key={timeSlot}
                          type="button"
                          variant={selectedAppointmentTime === timeSlot ? "default" : "outline"}
                          className="text-sm"
                          onClick={() => setValue('appointmentTime', timeSlot, { shouldValidate: true })}
                          disabled={!selectedCollaboratorId || !selectedDate || totalDurationMinutes === 0}
                        >
                          {timeSlot}
                        </Button>
                      ))
                    ) : selectedDate && selectedCollaboratorId && totalDurationMinutes > 0 ? (
                      <p className="text-gray-500 col-span-3">
                        Nenhum horário disponível para a data, colaborador e serviço selecionados.
                      </p>
                    ) : (
                      <p className="text-gray-500 col-span-3">
                        Selecione colaborador, serviço e data para ver os horários.
                      </p>
                    )}
                  </div>
                  {errors.appointmentTime && <p className="text-red-500 text-xs mt-1">{errors.appointmentTime.message}</p>}
                </div>
              </div>

              <div>
                <Label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                  Status do Agendamento *
                </Label>
                <Select onValueChange={(value) => setValue('status', value as 'pendente' | 'confirmado' | 'cancelado' | 'concluido', { shouldValidate: true })} value={selectedStatus}>
                  <SelectTrigger id="status" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
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
                  className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
                  disabled={loading || !selectedCollaboratorId || !selectedDate || totalDurationMinutes === 0 || availableTimeSlots.length === 0}
                >
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EditAgendamentoPage;