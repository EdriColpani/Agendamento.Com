import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Trash2, Edit } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO, addMinutes, parse, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { appointmentOverlapsException } from '@/utils/appointment-scheduling';
import { getAvailableTimeSlots } from '@/utils/appointment-scheduling';

// Zod schema for a single working schedule entry
const workingScheduleSchema = z.object({
  id: z.string().optional(),
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)."),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)."),
});

// Zod schema for a single schedule exception entry (for display)
const scheduleExceptionDisplaySchema = z.object({
  id: z.string().optional(),
  exception_date: z.string().min(1, "Data da exceção é obrigatória."),
  is_day_off: z.boolean().default(false),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM).").optional().or(z.literal('')),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM).").optional().or(z.literal('')),
  reason: z.string().optional(),
});

// Zod schema for the exception modal form
const exceptionModalSchema = z.object({
  is_day_off: z.boolean().default(false),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM).").optional().or(z.literal('')),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM).").optional().or(z.literal('')),
  reason: z.string().optional(),
}).refine(data => {
  if (!data.is_day_off) {
    return !!data.start_time && !!data.end_time;
  }
  return true;
}, {
  message: "Horário de início e fim são obrigatórios se não for dia de folga.",
  path: ["start_time"],
});

type ExceptionModalFormValues = z.infer<typeof exceptionModalSchema>;

// Main form schema (only for working schedules now)
const collaboratorScheduleFormSchema = z.object({
  working_schedules: z.array(workingScheduleSchema),
});

type CollaboratorScheduleFormValues = z.infer<typeof collaboratorScheduleFormSchema>;

interface Collaborator {
  id: string;
  first_name: string;
  last_name: string;
}

/** Agendamento em conflito com a exceção (para exibir no modal) */
interface ConflictingAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  total_duration_minutes: number;
  client_nickname: string | null;
  clients: { name: string | null } | null;
}

const daysOfWeek = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

const CollaboratorSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const { collaboratorId } = useParams<{ collaboratorId: string }>();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [loading, setLoading] = useState(true); // Loading for main page data fetch and main form submission
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [editingException, setEditingException] = useState<scheduleExceptionDisplaySchema | null>(null);
  const [isDeleteExceptionDialogOpen, setIsDeleteExceptionDialogOpen] = useState(false);
  const [exceptionToDelete, setExceptionToDelete] = useState<string | null>(null);
  const [exceptionsList, setExceptionsList] = useState<scheduleExceptionDisplaySchema[]>([]); // State for displaying exceptions
  const [savingException, setSavingException] = useState(false); // Loading for exception modal save button
  const [deletingException, setDeletingException] = useState(false); // Loading for exception delete button

  // Conflitos: agendamentos no período da exceção
  const [conflictingAppointments, setConflictingAppointments] = useState<ConflictingAppointment[]>([]);
  const [isConflictsModalOpen, setIsConflictsModalOpen] = useState(false);
  const [pendingExceptionPayload, setPendingExceptionPayload] = useState<{
    payload: { collaborator_id: string; company_id: string; exception_date: string; is_day_off: boolean; start_time: string | null; end_time: string | null; reason?: string };
    editingExceptionId: string | null;
  } | null>(null);
  const [loadingConflictAction, setLoadingConflictAction] = useState<string | null>(null); // id do agendamento em ação (cancelar/reagendar)
  const [savingExceptionAfterConflicts, setSavingExceptionAfterConflicts] = useState(false);

  // Submodal Reagendar
  const [rescheduleAppointment, setRescheduleAppointment] = useState<ConflictingAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleTimeSlots, setRescheduleTimeSlots] = useState<string[]>([]);
  const [selectedRescheduleTime, setSelectedRescheduleTime] = useState<string>('');
  const [loadingReschedule, setLoadingReschedule] = useState(false);

  // Main form for working schedules
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors: mainFormErrors },
  } = useForm<CollaboratorScheduleFormValues>({
    resolver: zodResolver(collaboratorScheduleFormSchema),
    defaultValues: {
      working_schedules: [],
    },
  });

  const { fields: workingScheduleFields, append: appendWorkingSchedule, remove: removeWorkingSchedule } = useFieldArray({
    control,
    name: "working_schedules",
  });

  // Form for the exception modal
  const {
    register: registerExceptionModal,
    handleSubmit: handleSubmitExceptionModal,
    reset: resetExceptionModal,
    watch: watchExceptionModal,
    setValue: setValueExceptionModal,
    formState: { errors: exceptionModalErrors },
  } = useForm<ExceptionModalFormValues>({
    resolver: zodResolver(exceptionModalSchema),
    defaultValues: {
      is_day_off: false,
      start_time: '09:00',
      end_time: '18:00',
      reason: '',
    },
  });

  const watchModalIsDayOff = watchExceptionModal('is_day_off');

  const fetchCollaboratorAndSchedules = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany || !collaboratorId || !primaryCompanyId) {
      return;
    }

    setLoading(true);
    try {
      // Fetch collaborator details
      const { data: collabData, error: collabError } = await supabase
        .from('collaborators')
        .select('first_name, last_name')
        .eq('id', collaboratorId)
        .eq('company_id', primaryCompanyId)
        .single();

      if (collabError || !collabData) {
        showError('Erro ao carregar dados do colaborador: ' + (collabError?.message || 'Colaborador não encontrado.'));
        navigate('/colaboradores');
        return;
      }
      setCollaborator({ id: collaboratorId, ...collabData });

      // Fetch working schedules
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('working_schedules')
        .select('id, day_of_week, start_time, end_time')
        .eq('collaborator_id', collaboratorId)
        .order('day_of_week', { ascending: true }, 'start_time', { ascending: true }); // Order by start_time too

      if (schedulesError) {
        showError('Erro ao carregar horários de trabalho: ' + schedulesError.message);
        console.error('Error fetching working schedules:', schedulesError);
      }

      // Fetch schedule exceptions
      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from('schedule_exceptions')
        .select('id, exception_date, is_day_off, start_time, end_time, reason')
        .eq('collaborator_id', collaboratorId)
        .order('exception_date', { ascending: true });

      if (exceptionsError) {
        showError('Erro ao carregar exceções de horário: ' + exceptionsError.message);
        console.error('Error fetching schedule exceptions:', exceptionsError);
      }

      reset({
        working_schedules: schedulesData ? schedulesData.map(schedule => ({
          ...schedule,
          start_time: schedule.start_time.substring(0, 5), // Format to HH:MM
          end_time: schedule.end_time.substring(0, 5),     // Format to HH:MM
        })) : [],
      });
      setExceptionsList(exceptionsData || []); // Update local state for display

    } catch (error: any) {
      console.error('Erro ao carregar dados da página:', error);
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [sessionLoading, loadingPrimaryCompany, collaboratorId, primaryCompanyId, navigate, reset]);

  useEffect(() => {
    fetchCollaboratorAndSchedules();
  }, [fetchCollaboratorAndSchedules]);

  // Main form submission for working schedules
  const onSubmitWorkingSchedules = async (data: CollaboratorScheduleFormValues) => {
    setLoading(true);
    if (!session?.user || !primaryCompanyId || !collaboratorId) {
      showError('Erro de autenticação ou dados da empresa/colaborador faltando.');
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch all current schedules for this collaborator and company
      const { data: existingSchedules, error: fetchError } = await supabase
        .from('working_schedules')
        .select('id')
        .eq('collaborator_id', collaboratorId)
        .eq('company_id', primaryCompanyId);

      if (fetchError) throw fetchError;

      const existingScheduleIds = existingSchedules.map(s => s.id);
      const newScheduleIds = data.working_schedules.filter(s => s.id).map(s => s.id);

      // IDs to delete are those existing schedules that are NOT in the new list
      const idsToDelete = existingScheduleIds.filter(id => !newScheduleIds.includes(id));

      // 2. Delete schedules that are no longer in the form
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('working_schedules')
          .delete()
          .in('id', idsToDelete); // Use .in with an array
        if (deleteError) throw deleteError;
      } else if (existingScheduleIds.length > 0 && newScheduleIds.length === 0) {
        // Special case: if there were existing schedules but now the form is empty, delete all.
        const { error: deleteAllError } = await supabase
          .from('working_schedules')
          .delete()
          .eq('collaborator_id', collaboratorId)
          .eq('company_id', primaryCompanyId);
        if (deleteAllError) throw deleteAllError;
      }

      // 3. Update existing schedules and insert new ones
      for (const schedule of data.working_schedules) {
        if (schedule.id) {
          // Update existing schedule
          const { error: updateError } = await supabase
            .from('working_schedules')
            .update({
              day_of_week: schedule.day_of_week,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
            })
            .eq('id', schedule.id)
            .eq('collaborator_id', collaboratorId)
            .eq('company_id', primaryCompanyId);
          if (updateError) throw updateError;
        } else {
          // Insert new schedule
          const { error: insertError } = await supabase
            .from('working_schedules')
            .insert({
              collaborator_id: collaboratorId,
              company_id: primaryCompanyId,
              day_of_week: schedule.day_of_week,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
            });
          if (insertError) throw insertError;
        }
      }

      showSuccess('Horários de trabalho semanais salvos com sucesso!');
      fetchCollaboratorAndSchedules(); // Re-fetch to ensure UI is updated with new IDs
    } catch (error: any) {
      console.error('Erro ao salvar horários de trabalho:', error);
      showError('Erro ao salvar horários de trabalho: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddException = () => {
    setEditingException(null);
    setSelectedDate(undefined);
    resetExceptionModal(); // Reset modal form
    setIsExceptionModalOpen(true);
  };

  const handleEditException = (exception: scheduleExceptionDisplaySchema) => {
    setEditingException(exception);
    setSelectedDate(parseISO(exception.exception_date));
    resetExceptionModal({
      is_day_off: exception.is_day_off,
      start_time: exception.start_time || '09:00',
      end_time: exception.end_time || '18:00',
      reason: exception.reason || '',
    });
    setIsExceptionModalOpen(true);
  };

  const persistException = async (
    payload: { collaborator_id: string; company_id: string; exception_date: string; is_day_off: boolean; start_time: string | null; end_time: string | null; reason?: string },
    editingExceptionId: string | null
  ) => {
    if (editingExceptionId) {
      const { error } = await supabase
        .from('schedule_exceptions')
        .update(payload)
        .eq('id', editingExceptionId)
        .eq('collaborator_id', collaboratorId!)
        .eq('company_id', primaryCompanyId!);
      if (error) throw error;
      showSuccess('Exceção atualizada com sucesso!');
    } else {
      const { error } = await supabase.from('schedule_exceptions').insert(payload);
      if (error) throw error;
      showSuccess('Exceção adicionada com sucesso!');
    }
    fetchCollaboratorAndSchedules();
    setPendingExceptionPayload(null);
    setConflictingAppointments([]);
    setIsConflictsModalOpen(false);
    setIsExceptionModalOpen(false);
    setEditingException(null);
    resetExceptionModal();
  };

  // This function is now the onSubmit for the modal's form
  const handleSaveException = async (modalData: ExceptionModalFormValues) => {
    setSavingException(true);
    if (!session?.user || !primaryCompanyId || !collaboratorId || !selectedDate) {
      showError('Erro: Dados incompletos para salvar a exceção.');
      setSavingException(false);
      return;
    }

    try {
      const exceptionDateFormatted = format(selectedDate, 'yyyy-MM-dd');
      const payload = {
        collaborator_id: collaboratorId,
        company_id: primaryCompanyId,
        exception_date: exceptionDateFormatted,
        is_day_off: modalData.is_day_off,
        start_time: modalData.is_day_off ? null : modalData.start_time,
        end_time: modalData.is_day_off ? null : modalData.end_time,
        reason: modalData.reason,
      };

      const { data: appointmentsOnDate, error: appError } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, total_duration_minutes, client_nickname, clients(name)')
        .eq('collaborator_id', collaboratorId)
        .eq('company_id', primaryCompanyId)
        .eq('appointment_date', exceptionDateFormatted)
        .neq('status', 'cancelado');

      if (appError) throw appError;

      const conflicts = (appointmentsOnDate || []).filter((apt: ConflictingAppointment) =>
        appointmentOverlapsException(
          apt.appointment_time,
          apt.total_duration_minutes,
          payload.is_day_off,
          payload.start_time,
          payload.end_time
        )
      ) as ConflictingAppointment[];

      if (conflicts.length > 0) {
        setConflictingAppointments(conflicts);
        setPendingExceptionPayload({ payload, editingExceptionId: editingException?.id ?? null });
        setIsExceptionModalOpen(false);
        setIsConflictsModalOpen(true);
        setSavingException(false);
        return;
      }

      await persistException(payload, editingException?.id ?? null);
    } catch (error: any) {
      console.error('Erro ao salvar exceção:', error);
      showError('Erro ao salvar exceção: ' + error.message);
    } finally {
      setSavingException(false);
    }
  };

  const handleCancelConflictingAppointment = async (appointmentId: string) => {
    if (!primaryCompanyId || !collaboratorId) return;
    setLoadingConflictAction(appointmentId);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelado' })
        .eq('id', appointmentId)
        .eq('company_id', primaryCompanyId)
        .eq('collaborator_id', collaboratorId);
      if (error) throw error;
      showSuccess('Agendamento cancelado.');
      setConflictingAppointments((prev) => prev.filter((a) => a.id !== appointmentId));
    } catch (err: any) {
      showError('Erro ao cancelar agendamento: ' + err.message);
    } finally {
      setLoadingConflictAction(null);
    }
  };

  const handleOpenReschedule = (apt: ConflictingAppointment) => {
    setRescheduleAppointment(apt);
    const date = parseISO(apt.appointment_date);
    setRescheduleDate(date);
    setSelectedRescheduleTime('');
    setRescheduleTimeSlots([]);
    setIsConflictsModalOpen(false);
    loadRescheduleSlots(date, apt.total_duration_minutes, apt.id);
  };

  const loadRescheduleSlots = async (date: Date, duration: number, excludeAppointmentId: string) => {
    if (!primaryCompanyId || !collaboratorId) return;
    try {
      const slots = await getAvailableTimeSlots(supabase, primaryCompanyId, collaboratorId, date, duration, undefined, excludeAppointmentId);
      setRescheduleTimeSlots(slots);
      setSelectedRescheduleTime(slots[0] || '');
    } catch (e) {
      setRescheduleTimeSlots([]);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleAppointment || !rescheduleDate || !selectedRescheduleTime || !primaryCompanyId) return;
    setLoadingReschedule(true);
    try {
      const dateStr = format(rescheduleDate, 'yyyy-MM-dd');
      const timeStr = selectedRescheduleTime.length <= 5 ? selectedRescheduleTime : selectedRescheduleTime.substring(0, 5);
      const { error } = await supabase
        .from('appointments')
        .update({ appointment_date: dateStr, appointment_time: timeStr })
        .eq('id', rescheduleAppointment.id)
        .eq('company_id', primaryCompanyId);
      if (error) throw error;
      showSuccess('Agendamento reagendado.');
      setConflictingAppointments((prev) => prev.filter((a) => a.id !== rescheduleAppointment.id));
      setRescheduleAppointment(null);
      setRescheduleDate(undefined);
      setSelectedRescheduleTime('');
      setRescheduleTimeSlots([]);
      setIsConflictsModalOpen(true);
    } catch (err: any) {
      showError('Erro ao reagendar: ' + err.message);
    } finally {
      setLoadingReschedule(false);
    }
  };

  useEffect(() => {
    if (rescheduleAppointment && rescheduleDate) {
      loadRescheduleSlots(rescheduleDate, rescheduleAppointment.total_duration_minutes, rescheduleAppointment.id);
    }
  }, [rescheduleDate, rescheduleAppointment?.id]);

  const handleSaveExceptionAfterConflicts = async (forceAnyway: boolean) => {
    if (!pendingExceptionPayload) return;
    if (!forceAnyway && conflictingAppointments.length > 0) {
      showError('Resolva ou cancele os agendamentos antes de salvar a exceção, ou use "Salvar exceção mesmo assim".');
      return;
    }
    setSavingExceptionAfterConflicts(true);
    try {
      await persistException(pendingExceptionPayload.payload, pendingExceptionPayload.editingExceptionId);
    } catch (err: any) {
      showError('Erro ao salvar exceção: ' + err.message);
    } finally {
      setSavingExceptionAfterConflicts(false);
    }
  };

  const handleCloseConflictsModal = () => {
    const payload = pendingExceptionPayload;
    setIsConflictsModalOpen(false);
    setPendingExceptionPayload(null);
    setConflictingAppointments([]);
    if (payload) {
      setSelectedDate(parseISO(payload.payload.exception_date));
      setValueExceptionModal('is_day_off', payload.payload.is_day_off);
      setValueExceptionModal('start_time', payload.payload.start_time || '09:00');
      setValueExceptionModal('end_time', payload.payload.end_time || '18:00');
      setValueExceptionModal('reason', payload.payload.reason || '');
    }
    setIsExceptionModalOpen(true);
  };

  const handleDeleteExceptionClick = (exceptionId: string) => {
    setExceptionToDelete(exceptionId);
    setIsDeleteExceptionDialogOpen(true);
  };

  const confirmDeleteException = async () => {
    if (exceptionToDelete && session?.user && primaryCompanyId && collaboratorId) {
      setDeletingException(true);
      try {
        const { error } = await supabase
          .from('schedule_exceptions')
          .delete()
          .eq('id', exceptionToDelete)
          .eq('collaborator_id', collaboratorId)
          .eq('company_id', primaryCompanyId);

        if (error) throw error;
        showSuccess('Exceção excluída com sucesso!');
        fetchCollaboratorAndSchedules(); // Re-fetch to update the list
      } catch (error: any) {
        console.error('Erro ao excluir exceção:', error);
        showError('Erro ao excluir exceção: ' + error.message);
      } finally {
        setDeletingException(false);
        setIsDeleteExceptionDialogOpen(false);
        setExceptionToDelete(null);
      }
    }
  };

  if (sessionLoading || loadingPrimaryCompany || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando horários do colaborador...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para gerenciar horários.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para gerenciar horários.
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

  if (!collaborator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Colaborador não encontrado.</p>
      </div>
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
        <h1 className="text-3xl font-bold text-gray-900">
          Horários de {collaborator.first_name} {collaborator.last_name}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmitWorkingSchedules)} className="space-y-6">
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Horário de Trabalho Semanal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {daysOfWeek.map((day) => {
              // Get all fields for the current day, along with their original indices in the workingScheduleFields array
              const daySlotsWithIndices = workingScheduleFields
                .map((field, index) => ({ field, index }))
                .filter(item => item.field.day_of_week === day.value)
                .sort((a, b) => a.field.start_time.localeCompare(b.field.start_time)); // Sort by start_time for consistent display

              const isWorkingDay = daySlotsWithIndices.length > 0;

              return (
                <div key={day.value} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-32 font-medium text-gray-900">{day.label}</div>
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={isWorkingDay}
                      onCheckedChange={(checked) => {
                        if (checked && !isWorkingDay) { // If checked and no slots exist, add one
                          appendWorkingSchedule({
                            day_of_week: day.value,
                            start_time: '09:00',
                            end_time: '12:00',
                          });
                        } else if (!checked && isWorkingDay) { // If unchecked and slots exist, remove all
                          const indicesToRemove = daySlotsWithIndices.map(item => item.index);
                          removeWorkingSchedule(indicesToRemove);
                        }
                      }}
                    />
                    <Label htmlFor={`day-${day.value}`} className="flex-1">Trabalha neste dia</Label>
                  </div>

                  {isWorkingDay && (
                    <div className="space-y-2 mt-2 pl-36"> {/* Indent for better visual */}
                      {daySlotsWithIndices.map((item) => (
                        <div key={item.field.id || `new-${item.index}`} className="flex items-center gap-2">
                          <Input
                            type="time"
                            {...register(`working_schedules.${item.index}.start_time`)}
                            className="w-28 text-sm border-gray-300"
                          />
                          <span>-</span>
                          <Input
                            type="time"
                            {...register(`working_schedules.${item.index}.end_time`)}
                            className="w-28 text-sm border-gray-300"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => removeWorkingSchedule(item.index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {mainFormErrors.working_schedules?.[item.index]?.start_time && <p className="col-span-4 text-red-500 text-xs text-right">{mainFormErrors.working_schedules[item.index]?.start_time?.message}</p>}
                          {mainFormErrors.working_schedules?.[item.index]?.end_time && <p className="col-span-4 text-red-500 text-xs text-right">{mainFormErrors.working_schedules[item.index]?.end_time?.message}</p>}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="!rounded-button whitespace-nowrap mt-2"
                        onClick={() => appendWorkingSchedule({ day_of_week: day.value, start_time: '13:30', end_time: '18:00' })}
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Adicionar Bloco de Horário
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-gray-900">Exceções de Horário</CardTitle>
            <Button
              type="button"
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddException}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Adicionar Exceção
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {exceptionsList.length === 0 ? (
              <p className="text-gray-600">Nenhuma exceção de horário cadastrada.</p>
            ) : (
              exceptionsList.map((exception) => (
                <div key={exception.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">
                      {format(parseISO(exception.exception_date), 'dd/MM/yyyy', { locale: ptBR })}
                      {exception.is_day_off ? ' (Dia de Folga)' : ` (${exception.start_time || 'N/A'} - ${exception.end_time || 'N/A'})`}
                    </p>
                    {exception.reason && <p className="text-sm text-gray-600">{exception.reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="!rounded-button whitespace-nowrap"
                      onClick={() => handleEditException(exception)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="!rounded-button whitespace-nowrap"
                      onClick={() => handleDeleteExceptionClick(exception.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
            className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base flex-1"
            disabled={loading}
          >
            {loading ? 'Salvando...' : 'Salvar Horários Semanais'}
          </Button>
        </div>
      </form>

      {/* Modal para Adicionar/Editar Exceção */}
      <Dialog open={isExceptionModalOpen} onOpenChange={setIsExceptionModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingException ? 'Editar Exceção' : 'Adicionar Exceção'}</DialogTitle>
            <DialogDescription>
              Defina um dia de folga ou um horário especial para o colaborador.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitExceptionModal(handleSaveException)} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="exception_date_modal" className="text-right">
                Data
              </Label>
              <div className="col-span-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  locale={ptBR}
                />
                {!selectedDate && <p className="text-red-500 text-xs mt-1">Selecione uma data.</p>}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_day_off_modal" className="text-right">
                Dia de Folga
              </Label>
              <Checkbox
                id="is_day_off_modal"
                checked={watchModalIsDayOff}
                onCheckedChange={(checked) => setValueExceptionModal('is_day_off', !!checked, { shouldValidate: true })}
                className="col-span-3"
              />
            </div>
            {!watchModalIsDayOff && ( // Only show if not a full day off
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="start_time_modal" className="text-right">
                    Início
                  </Label>
                  <Input
                    id="start_time_modal"
                    type="time"
                    {...registerExceptionModal('start_time')}
                    className="col-span-3"
                  />
                  {exceptionModalErrors.start_time && <p className="col-span-4 text-red-500 text-xs text-right">{exceptionModalErrors.start_time.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="end_time_modal" className="text-right">
                    Fim
                  </Label>
                  <Input
                    id="end_time_modal"
                    type="time"
                    {...registerExceptionModal('end_time')}
                    className="col-span-3"
                  />
                  {exceptionModalErrors.end_time && <p className="col-span-4 text-red-500 text-xs text-right">{exceptionModalErrors.end_time.message}</p>}
                </div>
              </>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="reason_modal" className="text-right">
                Motivo
              </Label>
              <Input
                id="reason_modal"
                type="text"
                {...registerExceptionModal('reason')}
                className="col-span-3"
              />
              {exceptionModalErrors.reason && <p className="col-span-4 text-red-500 text-xs text-right">{exceptionModalErrors.reason.message}</p>}
            </div>
            <DialogFooter className="flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsExceptionModalOpen(false)}
                className="!rounded-button whitespace-nowrap"
                disabled={savingException}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedDate || savingException} className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90">
                {savingException ? 'Salvando...' : 'Salvar Exceção'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de conflitos: agendamentos no período da exceção */}
      <Dialog open={isConflictsModalOpen} onOpenChange={(open) => { if (!open) handleCloseConflictsModal(); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Agendamentos no período da exceção</DialogTitle>
            <DialogDescription>
              Existem agendamentos no horário escolhido. Cancele ou reagende cada um e depois salve a exceção.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[280px] overflow-y-auto py-2">
            {conflictingAppointments.length === 0 ? (
              <p className="text-gray-600 text-sm">Nenhum conflito restante. Você pode salvar a exceção.</p>
            ) : (
              conflictingAppointments.map((apt) => {
                const clientLabel = apt.client_nickname || apt.clients?.name || 'Cliente';
                const start = parse(apt.appointment_time.substring(0, 5), 'HH:mm', startOfDay(new Date()));
                const endStr = format(addMinutes(start, apt.total_duration_minutes), 'HH:mm');
                return (
                  <div key={apt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="font-medium text-gray-900">{clientLabel}</p>
                      <p className="text-sm text-gray-600">
                        {format(parseISO(apt.appointment_date), 'dd/MM/yyyy', { locale: ptBR })} — {apt.appointment_time.substring(0, 5)} até {endStr} ({apt.total_duration_minutes} min)
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        disabled={!!loadingConflictAction}
                        onClick={() => handleOpenReschedule(apt)}
                      >
                        Reagendar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        disabled={!!loadingConflictAction}
                        onClick={() => handleCancelConflictingAppointment(apt.id)}
                      >
                        {loadingConflictAction === apt.id ? '...' : 'Cancelar'}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleCloseConflictsModal} disabled={savingExceptionAfterConflicts} className="!rounded-button">
              Voltar
            </Button>
            {conflictingAppointments.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="!rounded-button"
                disabled={savingExceptionAfterConflicts}
                onClick={() => handleSaveExceptionAfterConflicts(true)}
              >
                Salvar exceção mesmo assim
              </Button>
            )}
            <Button
              type="button"
              className="!rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={savingExceptionAfterConflicts}
              onClick={() => handleSaveExceptionAfterConflicts(false)}
            >
              {savingExceptionAfterConflicts ? 'Salvando...' : 'Salvar exceção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Reagendar: escolher nova data e horário */}
      <Dialog
        open={!!rescheduleAppointment}
        onOpenChange={(open) => {
          if (!open) {
            setRescheduleAppointment(null);
            setRescheduleDate(undefined);
            setSelectedRescheduleTime('');
            setRescheduleTimeSlots([]);
            setIsConflictsModalOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reagendar agendamento</DialogTitle>
            <DialogDescription>
              Escolha a nova data e horário para este agendamento.
            </DialogDescription>
          </DialogHeader>
          {rescheduleAppointment && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Data</Label>
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={(d) => { setRescheduleDate(d); }}
                  locale={ptBR}
                />
              </div>
              <div className="grid gap-2">
                <Label>Horário</Label>
                <Select value={selectedRescheduleTime} onValueChange={setSelectedRescheduleTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o horário" />
                  </SelectTrigger>
                  <SelectContent>
                    {rescheduleTimeSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rescheduleTimeSlots.length === 0 && rescheduleDate && (
                  <p className="text-sm text-amber-600">Nenhum horário disponível nesta data.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRescheduleAppointment(null); setIsConflictsModalOpen(true); }} disabled={loadingReschedule} className="!rounded-button">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReschedule}
              disabled={!rescheduleDate || !selectedRescheduleTime || loadingReschedule}
              className="!rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loadingReschedule ? 'Reagendando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Exception Confirmation Dialog */}
      <Dialog open={isDeleteExceptionDialogOpen} onOpenChange={setIsDeleteExceptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta exceção de horário? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteExceptionDialogOpen(false)} disabled={deletingException}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteException} disabled={deletingException}>
              {deletingException ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CollaboratorSchedulePage;