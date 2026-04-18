import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

// Helper function for numeric preprocessing
const numericPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    return val.replace(',', '.');
  }
  return val;
};

// Zod schema for plan registration
const planSchema = z.object({
  name: z.string().min(1, "O nome do plano é obrigatório."),
  description: z.string().optional(),
  price: z.preprocess(
    numericPreprocess,
    z.string()
      .regex(/^\d+(\.\d{1,2})?$/, "Preço inválido. Use formato 0.00 ou 0,00")
      .transform(Number)
      .refine(val => !isNaN(val) && val >= 0, "Preço deve ser um número positivo.")
  ),
  features: z.string().optional(), // Stored as a single string, split by newline
  duration_months: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().int().min(1, "Duração mínima é de 1 mês.")
  ),
  status: z.enum(['active', 'inactive', 'deprecated'], {
    errorMap: () => ({ message: "O status é obrigatório." })
  }),
});

type PlanFormValues = z.infer<typeof planSchema>;

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  features: string[] | null;
  duration_months: number;
  status: 'active' | 'inactive' | 'deprecated';
}

interface PlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPlan: Plan | null;
  onPlanSaved: () => void;
}

const PlanFormModal: React.FC<PlanFormModalProps> = ({
  isOpen,
  onClose,
  editingPlan,
  onPlanSaved,
}) => {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      description: '',
      price: '0.00' as any,
      features: '',
      duration_months: 1,
      status: 'active',
    },
  });

  const statusValue = watch('status');

  useEffect(() => {
    if (isOpen) {
      if (editingPlan) {
        // Load data for editing
        reset({
          name: editingPlan.name,
          description: editingPlan.description || '',
          price: editingPlan.price.toFixed(2).replace('.', ','),
          features: editingPlan.features ? editingPlan.features.join('\n') : '',
          duration_months: editingPlan.duration_months,
          status: editingPlan.status,
        });
      } else {
        // Reset to default values for new plan
        reset({
          name: '',
          description: '',
          price: '0.00' as any,
          features: '',
          duration_months: 1,
          status: 'active',
        });
      }
    }
  }, [editingPlan, reset, isOpen]); // Depend on isOpen to trigger reset when modal opens

  const onSubmit = async (data: PlanFormValues) => {
    setLoading(true);
    
    // Convert features string (newline separated) to array of strings
    const featuresArray = data.features ? data.features.split('\n').map(f => f.trim()).filter(f => f.length > 0) : [];

    const payload = {
      name: data.name,
      description: data.description,
      price: data.price,
      features: featuresArray,
      duration_months: data.duration_months,
      status: data.status,
    };

    try {
      let error;
      if (editingPlan) {
        // Update existing plan
        const { error: updateError } = await supabase
          .from('subscription_plans')
          .update(payload)
          .eq('id', editingPlan.id);
        error = updateError;
      } else {
        // Insert new plan
        const { error: insertError } = await supabase
          .from('subscription_plans')
          .insert(payload);
        error = insertError;
      }

      if (error) {
        throw error;
      }

      showSuccess('Plano ' + (editingPlan ? 'atualizado' : 'cadastrado') + ' com sucesso!');
      onPlanSaved();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar plano:', error);
      showError('Erro ao salvar plano: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const modalTitle = editingPlan ? 'Editar Plano de Assinatura' : 'Novo Plano de Assinatura';
  const buttonText = editingPlan ? 'Salvar Alterações' : 'Criar Plano';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            Defina os detalhes e o preço do plano de assinatura.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Nome *
            </Label>
            <Input
              id="name"
              {...register('name')}
              className="col-span-3"
            />
            {errors.name && <p className="col-span-4 text-red-500 text-xs text-right">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">
              Descrição
            </Label>
            <Textarea
              id="description"
              {...register('description')}
              rows={3}
              className="col-span-3 resize-none"
            />
            {errors.description && <p className="col-span-4 text-red-500 text-xs text-right">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price" className="text-right">
              Preço (R$) *
            </Label>
            <Input
              id="price"
              type="text"
              placeholder="0,00"
              {...register('price')}
              className="col-span-3"
            />
            {errors.price && <p className="col-span-4 text-red-500 text-xs text-right">{errors.price.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="duration_months" className="text-right">
              Duração (Meses) *
            </Label>
            <Input
              id="duration_months"
              type="number"
              min="1"
              {...register('duration_months')}
              className="col-span-3"
            />
            {errors.duration_months && <p className="col-span-4 text-red-500 text-xs text-right">{errors.duration_months.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">
              Status *
            </Label>
            <Select onValueChange={(value) => setValue('status', value as 'active' | 'inactive' | 'deprecated', { shouldValidate: true })} value={statusValue}>
              <SelectTrigger id="status" className="col-span-3">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
                <SelectItem value="deprecated">Descontinuado</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && <p className="col-span-4 text-red-500 text-xs text-right">{errors.status.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="features" className="text-right pt-2">
              Funcionalidades (Uma por linha)
            </Label>
            <Textarea
              id="features"
              {...register('features')}
              rows={5}
              placeholder="Ex:&#10;Agendamentos ilimitados&#10;Relatórios avançados&#10;Suporte prioritário"
              className="col-span-3 resize-none"
            />
            {errors.features && <p className="col-span-4 text-red-500 text-xs text-right">{errors.features.message}</p>}
          </div>
          
          <DialogFooter className="flex justify-between items-center mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="!rounded-button whitespace-nowrap"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Salvando...' : buttonText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PlanFormModal;