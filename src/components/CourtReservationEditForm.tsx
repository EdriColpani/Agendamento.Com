import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { format, parse, parseISO, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

const courtEditSchema = z.object({
  clientId: z.string().min(1, 'Cliente é obrigatório.'),
  clientNickname: z.string().max(200).optional(),
  observations: z.string().max(500, 'Máximo de 500 caracteres.').optional(),
  cancellationReason: z.string().max(250, 'Máximo de 250 caracteres.').optional(),
  status: z.enum(['pendente', 'confirmado', 'cancelado', 'concluido'], {
    errorMap: () => ({ message: 'O status é obrigatório.' }),
  }),
});

export type CourtEditFormValues = z.infer<typeof courtEditSchema>;

export interface CourtAppointmentRow {
  id: string;
  client_id: string;
  client_nickname: string | null;
  appointment_date: string;
  appointment_time: string;
  total_duration_minutes: number;
  total_price: number;
  observations: string | null;
  status: string;
  court_id: string | null;
  payment_method: string | null;
  mp_payment_id: string | null;
  mp_payment_status: string | null;
  courts: { name: string } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface CourtReservationEditFormProps {
  appointment: CourtAppointmentRow;
  clients: ClientOption[];
  primaryCompanyId: string;
  onSuccess: () => void;
  onBack: () => void;
}

export const CourtReservationEditForm: React.FC<CourtReservationEditFormProps> = ({
  appointment,
  clients,
  primaryCompanyId,
  onSuccess,
  onBack,
}) => {
  const [saving, setSaving] = React.useState(false);

  const timeLabel = useMemo(() => {
    const d = parseISO(appointment.appointment_date);
    const tRaw = appointment.appointment_time?.substring(0, 5) ?? '00:00';
    const start = parse(tRaw, 'HH:mm', d);
    const end = addMinutes(start, appointment.total_duration_minutes ?? 60);
    return `${format(start, 'HH:mm')} às ${format(end, 'HH:mm')}`;
  }, [appointment]);

  const dateLabel = useMemo(
    () => format(parseISO(appointment.appointment_date), "dd/MM/yyyy", { locale: ptBR }),
    [appointment.appointment_date]
  );

  const courtName = appointment.courts?.name?.trim() || 'Quadra';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CourtEditFormValues>({
    resolver: zodResolver(courtEditSchema),
    defaultValues: {
      clientId: appointment.client_id,
      clientNickname: appointment.client_nickname || '',
      observations: appointment.observations || '',
      cancellationReason: '',
      status: (appointment.status as CourtEditFormValues['status']) || 'pendente',
    },
  });

  useEffect(() => {
    reset({
      clientId: appointment.client_id,
      clientNickname: appointment.client_nickname || '',
      observations: appointment.observations || '',
      cancellationReason: '',
      status: (appointment.status as CourtEditFormValues['status']) || 'pendente',
    });
  }, [appointment, reset]);

  const selectedClientId = watch('clientId');
  const selectedStatus = watch('status');
  const hasMercadoPagoPayment = appointment.payment_method === 'mercado_pago' && !!appointment.mp_payment_id;
  const hasPaidMercadoPago = hasMercadoPagoPayment && appointment.mp_payment_status === 'approved';

  const onSubmit = async (data: CourtEditFormValues) => {
    setSaving(true);
    try {
      const isTransitionToCancelled = data.status === 'cancelado' && appointment.status !== 'cancelado';
      if (isTransitionToCancelled) {
        const functionName = hasMercadoPagoPayment
          ? 'refund-court-booking-payment'
          : 'cancel-court-booking-with-policy';
        const { data: cancelData, error } = await supabase.functions.invoke(functionName, {
          body: {
            appointment_id: appointment.id,
            company_id: primaryCompanyId,
            client_id: data.clientId,
            client_nickname: data.clientNickname?.trim() || null,
            observations: data.observations?.trim() || null,
            cancellation_reason: data.cancellationReason?.trim() || null,
          },
        });

        if (error) throw error;
        const payload = cancelData as {
          error?: string;
          refund_required?: boolean;
          refund_auto?: boolean;
          manual_required?: boolean;
        } | null;
        if (payload?.error) throw new Error(payload.error);

        if (payload?.manual_required || payload?.refund_required) {
          showSuccess('Reserva cancelada. Reembolso marcado para tratamento manual no financeiro.');
        } else if (payload?.refund_auto) {
          showSuccess('Reserva cancelada com estorno automático no Mercado Pago.');
        } else {
          showSuccess('Reserva cancelada com sucesso.');
        }
        onSuccess();
        return;
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          client_id: data.clientId,
          client_nickname: data.clientNickname?.trim() || null,
          observations: data.observations?.trim() || null,
          status: data.status,
        })
        .eq('id', appointment.id)
        .eq('company_id', primaryCompanyId);

      if (error) throw error;
      showSuccess('Reserva atualizada com sucesso.');
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao salvar: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" className="!rounded-button cursor-pointer" type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Editar reserva de quadra</h1>
      </div>

      <div className="max-w-2xl space-y-4">
        <Card className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="p-4 text-sm text-gray-800 dark:text-gray-200">
            <p>
              <span className="font-medium">Quadra:</span> {courtName}
            </p>
            <p>
              <span className="font-medium">Data:</span> {dateLabel}
            </p>
            <p>
              <span className="font-medium">Horário:</span> {timeLabel}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Data, horário e quadra não podem ser alterados aqui; cancele esta reserva e crie outra na agenda de
              quadras, se precisar mudar o horário.
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="court-clientId" className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente *
                  </Label>
                  <Select
                    onValueChange={(value) => setValue('clientId', value, { shouldValidate: true })}
                    value={selectedClientId}
                  >
                    <SelectTrigger id="court-clientId" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <SelectItem value="none" disabled>
                          Nenhum cliente disponível.
                        </SelectItem>
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
                  <Label htmlFor="court-nickname" className="block text-sm font-medium text-gray-700 mb-2">
                    Apelido (opcional)
                  </Label>
                  <Input
                    id="court-nickname"
                    type="text"
                    placeholder="Apelido do cliente"
                    {...register('clientNickname')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.clientNickname && (
                    <p className="text-red-500 text-xs mt-1">{errors.clientNickname.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="court-status" className="block text-sm font-medium text-gray-700 mb-2">
                  Status *
                </Label>
                <Select
                  onValueChange={(value) =>
                    setValue('status', value as CourtEditFormValues['status'], { shouldValidate: true })
                  }
                  value={selectedStatus}
                >
                  <SelectTrigger id="court-status" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
                {selectedStatus === 'cancelado' && hasPaidMercadoPago ? (
                  <p className="text-xs text-amber-700 mt-2">
                    Esta reserva foi paga online. Ao cancelar, o sistema marca o reembolso como pendente para
                    tratamento manual.
                  </p>
                ) : null}
              </div>

              {selectedStatus === 'cancelado' ? (
                <div>
                  <Label htmlFor="court-cancel-reason" className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo do cancelamento
                  </Label>
                  <Textarea
                    id="court-cancel-reason"
                    maxLength={250}
                    {...register('cancellationReason')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20 resize-none"
                    placeholder="Ex.: cliente desistiu, clima, manutenção da quadra..."
                  />
                  {errors.cancellationReason && (
                    <p className="text-red-500 text-xs mt-1">{errors.cancellationReason.message}</p>
                  )}
                </div>
              ) : null}

              <div>
                <Label htmlFor="court-obs" className="block text-sm font-medium text-gray-700 mb-2">
                  Observações
                </Label>
                <Textarea
                  id="court-obs"
                  maxLength={500}
                  {...register('observations')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-24 resize-none"
                  placeholder="Observações sobre a reserva..."
                />
                {errors.observations && <p className="text-red-500 text-xs mt-1">{errors.observations.message}</p>}
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="!rounded-button flex-1"
                  onClick={onBack}
                  disabled={saving}
                >
                  Voltar sem salvar
                </Button>
                <Button
                  type="submit"
                  className="!rounded-button flex-1 bg-yellow-600 hover:bg-yellow-700 text-black"
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
