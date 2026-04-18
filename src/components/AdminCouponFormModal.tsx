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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

// Helper function for numeric preprocessing
const numericPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    return val.replace(',', '.');
  }
  return val;
};

// Zod schema for admin coupon
const adminCouponSchema = z.object({
  code: z.string()
    .min(3, "O código deve ter pelo menos 3 caracteres.")
    .transform((val) => val.toUpperCase()), // Transform to uppercase
  discount_type: z.enum(['percentual', 'fixed'], {
    errorMap: () => ({ message: "Tipo de desconto é obrigatório." })
  }),
  discount_value: z.preprocess(
    numericPreprocess,
    z.string()
      .regex(/^\d+(\.\d{1,2})?$/, "Valor inválido. Use formato 0.00 ou 0,00")
      .transform(Number)
      .refine(val => !isNaN(val) && val > 0, "Valor deve ser um número positivo.")
  ),
  valid_until: z.string().optional(),
  max_uses: z.preprocess(
    (val) => (val === '' ? 1 : Number(val)),
    z.number().int().min(1, "Uso mínimo é 1.")
  ),
  status: z.enum(['active', 'inactive', 'expired'], {
    errorMap: () => ({ message: "O status é obrigatório." })
  }),
  billing_period: z.enum(['any', 'monthly', 'yearly']).default('any'),
  plan_id: z.string().uuid().nullable().optional(),
});

type AdminCouponFormValues = z.infer<typeof adminCouponSchema>;

interface AdminCoupon {
  id: string;
  code: string;
  discount_type: 'percentual' | 'fixed';
  discount_value: number;
  valid_until: string | null;
  max_uses: number;
  current_uses: number;
  status: 'active' | 'inactive' | 'expired';
  plan_id: string | null;
  billing_period?: 'any' | 'monthly' | 'yearly';
}

interface AdminCouponFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCoupon: AdminCoupon | null;
  onCouponSaved: () => void;
}

const AdminCouponFormModal: React.FC<AdminCouponFormModalProps> = ({
  isOpen,
  onClose,
  editingCoupon,
  onCouponSaved,
}) => {
  const { session } = useSession();
  const [loading, setLoading] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<{ id: string; name: string }[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AdminCouponFormValues>({
    resolver: zodResolver(adminCouponSchema),
    defaultValues: {
      code: '',
      discount_type: 'percentual',
      discount_value: '0.00' as any,
      valid_until: '',
      max_uses: 1,
      status: 'active',
      billing_period: 'any',
      plan_id: null,
    },
  });

  const discountTypeValue = watch('discount_type');
  const statusValue = watch('status');
  const codeValue = watch('code'); // Watch code value for input display
  const billingPeriodValue = watch('billing_period');
  const planIdValue = watch('plan_id');

  // Carregar planos disponíveis quando o modal abrir
  useEffect(() => {
    const fetchPlans = async () => {
      if (!isOpen) return;
      
      try {
        const { data, error } = await supabase
          .from('subscription_plans')
          .select('id, name')
          .eq('status', 'active')
          .order('price', { ascending: true });

        if (error) throw error;
        setAvailablePlans(data || []);
      } catch (error: any) {
        console.error('Erro ao carregar planos:', error);
        showError('Erro ao carregar planos: ' + error.message);
      }
    };

    fetchPlans();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (editingCoupon) {
        // Load data for editing
        reset({
          code: editingCoupon.code,
          discount_type: editingCoupon.discount_type,
          discount_value: editingCoupon.discount_value.toFixed(2).replace('.', ','),
          valid_until: editingCoupon.valid_until || '',
          max_uses: editingCoupon.max_uses,
          status: editingCoupon.status,
          billing_period: editingCoupon.billing_period || 'any',
          plan_id: editingCoupon.plan_id || null,
        });
      } else {
        // Reset to default values for new coupon
        reset({
          code: '',
          discount_type: 'percentual',
          discount_value: '0.00' as any,
          valid_until: '',
          max_uses: 1,
          status: 'active',
          billing_period: 'any',
          plan_id: null,
        });
      }
    }
  }, [editingCoupon, reset, isOpen]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Update value in form state, Zod will handle the uppercase transformation on submit
    setValue('code', e.target.value, { shouldValidate: true });
  };

  const onSubmit = async (data: AdminCouponFormValues) => {
    setLoading(true);
    if (!session?.user) {
      showError('Erro de autenticação.');
      setLoading(false);
      return;
    }

    // Note: data.code is already uppercase due to Zod transform
    const payload = {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      valid_until: data.valid_until || null,
      max_uses: data.max_uses,
      status: data.status,
      billing_period: data.billing_period || 'any',
      plan_id: data.plan_id || null,
      created_by_user_id: session.user.id,
    };

    try {
      let error;
      if (editingCoupon) {
        // Update existing coupon
        const { error: updateError } = await supabase
          .from('admin_coupons')
          .update(payload)
          .eq('id', editingCoupon.id);
        error = updateError;
      } else {
        // Insert new coupon
        const { error: insertError } = await supabase
          .from('admin_coupons')
          .insert(payload);
        error = insertError;
      }

      if (error) {
        // Check for unique constraint violation on 'code'
        if (error.code === '23505' && error.message.includes('admin_coupons_code_key')) {
          showError('O código do cupom já existe. Por favor, escolha outro.');
        } else {
          throw error;
        }
      } else {
        showSuccess('Cupom ' + (editingCoupon ? 'atualizado' : 'criado') + ' com sucesso!');
        onCouponSaved();
        onClose();
      }
    } catch (error: any) {
      console.error('Erro ao salvar cupom:', error);
      showError('Erro ao salvar cupom: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const modalTitle = editingCoupon ? 'Editar Cupom Administrativo' : 'Novo Cupom Administrativo';
  const buttonText = editingCoupon ? 'Salvar Alterações' : 'Criar Cupom';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            Crie cupons de desconto para uso exclusivo de Proprietários de Empresas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="code" className="text-right">
              Código *
            </Label>
            <Input
              id="code"
              // Use value and onChange to control the input, but let Zod handle the final uppercase transformation
              value={codeValue}
              onChange={handleCodeChange}
              className="col-span-3 uppercase"
              maxLength={20}
            />
            {errors.code && <p className="col-span-4 text-red-500 text-xs text-right">{errors.code.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="billing_period" className="text-right">
              Período *
            </Label>
            <Select
              onValueChange={(value) =>
                setValue('billing_period', value as 'any' | 'monthly' | 'yearly', { shouldValidate: true })
              }
              value={billingPeriodValue || 'any'}
            >
              <SelectTrigger id="billing_period" className="col-span-3">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Mensal ou Anual (qualquer)</SelectItem>
                <SelectItem value="monthly">Apenas mensal</SelectItem>
                <SelectItem value="yearly">Apenas anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="discount_type" className="text-right">
              Tipo *
            </Label>
            <Select onValueChange={(value) => setValue('discount_type', value as 'percentual' | 'fixed', { shouldValidate: true })} value={discountTypeValue}>
              <SelectTrigger id="discount_type" className="col-span-3">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual">Percentual (%)</SelectItem>
                <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
            {errors.discount_type && <p className="col-span-4 text-red-500 text-xs text-right">{errors.discount_type.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="discount_value" className="text-right">
              Valor *
            </Label>
            <Input
              id="discount_value"
              type="text"
              placeholder="0.00"
              {...register('discount_value')}
              className="col-span-3"
            />
            {errors.discount_value && <p className="col-span-4 text-red-500 text-xs mt-1">{errors.discount_value.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="max_uses" className="text-right">
              Usos Máximos *
            </Label>
            <Input
              id="max_uses"
              type="number"
              min="1"
              {...register('max_uses')}
              className="col-span-3"
            />
            {errors.max_uses && <p className="col-span-4 text-red-500 text-xs mt-1">{errors.max_uses.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="valid_until" className="text-right">
              Válido Até
            </Label>
            <Input
              id="valid_until"
              type="date"
              {...register('valid_until')}
              className="col-span-3"
            />
            {errors.valid_until && <p className="col-span-4 text-red-500 text-xs mt-1">{errors.valid_until.message}</p>}
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">
              Status *
            </Label>
            <Select onValueChange={(value) => setValue('status', value as 'active' | 'inactive' | 'expired', { shouldValidate: true })} value={statusValue}>
              <SelectTrigger id="status" className="col-span-3">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
                <SelectItem value="expired">Expirado</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && <p className="col-span-4 text-red-500 text-xs text-right">{errors.status.message}</p>}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="plan_id" className="text-right">
              Plano Específico
            </Label>
            <Select 
              onValueChange={(value) => setValue('plan_id', value === 'all' ? null : value, { shouldValidate: true })} 
              value={planIdValue || 'all'}
            >
              <SelectTrigger id="plan_id" className="col-span-3">
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos (geral)</SelectItem>
                {availablePlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="col-span-4 text-xs text-gray-500 text-right">
              Selecione um plano específico ou deixe "Todos os planos" para cupom geral
            </p>
            {errors.plan_id && <p className="col-span-4 text-red-500 text-xs text-right">{errors.plan_id.message}</p>}
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

export default AdminCouponFormModal;