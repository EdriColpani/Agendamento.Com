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
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Session } from '@supabase/supabase-js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Esquema de validação com Zod
const profileSchema = z.object({
  first_name: z.string().min(1, "Nome é obrigatório."),
  last_name: z.string().min(1, "Sobrenome é obrigatório."),
  phone_number: z.string()
    .min(1, "Número de telefone é obrigatório.")
    .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Formato de telefone inválido (ex: (XX) XXXXX-XXXX)"),
  cpf: z.string()
    .min(1, "CPF é obrigatório.")
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "Formato de CPF inválido (ex: XXX.XXX.XXX-XX)"),
  birth_date: z.string().min(1, "Data de nascimento é obrigatória."),
  gender: z.enum(['Masculino', 'Feminino', 'Outro'], {
    errorMap: () => ({ message: "Gênero é obrigatório." })
  }),
  avatar_url: z.string().url("URL do avatar inválida.").optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session;
  currentProfile: any; // Current profile data to pre-fill the form
  onProfileUpdated: () => void; // Callback to refresh profile data in parent
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  isOpen,
  onClose,
  session,
  currentProfile,
  onProfileUpdated,
}) => {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone_number: '',
      cpf: '',
      birth_date: '',
      gender: undefined,
      avatar_url: '',
    },
  });

  // Watchers for formatted inputs
  const phoneNumberValue = watch('phone_number');
  const cpfValue = watch('cpf');
  const genderValue = watch('gender');

  useEffect(() => {
    if (currentProfile) {
      reset({
        first_name: currentProfile.first_name || '',
        last_name: currentProfile.last_name || '',
        phone_number: formatPhoneNumberInput(currentProfile.phone_number || ''),
        cpf: formatCpfInput(currentProfile.cpf || ''),
        birth_date: currentProfile.birth_date || '',
        gender: currentProfile.gender || undefined,
        avatar_url: currentProfile.avatar_url || '',
      });
    }
  }, [currentProfile, reset]);

  const formatPhoneNumberInput = (value: string) => {
    if (!value) return '';
    let cleaned = value.replace(/\D/g, ''); // Remove non-digits
    if (cleaned.length > 11) cleaned = cleaned.substring(0, 11); // Limit to 11 digits

    if (cleaned.length <= 2) {
      return `(${cleaned}`;
    } else if (cleaned.length <= 7) { // (XX) XXXXX
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
    } else if (cleaned.length <= 11) { // (XX) XXXXX-XXXX
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
    }
    return cleaned;
  };

  const formatCpfInput = (value: string) => {
    if (!value) return '';
    let cleaned = value.replace(/\D/g, ''); // Remove non-digits
    if (cleaned.length > 11) cleaned = cleaned.substring(0, 11); // Limit to 11 digits

    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `${cleaned.substring(0, 3)}.${cleaned.substring(3)}`;
    } else if (cleaned.length <= 9) {
      return `${cleaned.substring(0, 3)}.${cleaned.substring(3, 6)}.${cleaned.substring(6)}`;
    } else {
      return `${cleaned.substring(0, 3)}.${cleaned.substring(3, 6)}.${cleaned.substring(6, 9)}-${cleaned.substring(9)}`;
    }
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatPhoneNumberInput(e.target.value);
    setValue('phone_number', formattedValue, { shouldValidate: true });
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatCpfInput(e.target.value);
    setValue('cpf', formattedValue, { shouldValidate: true });
  };

  const onSubmit = async (data: ProfileFormValues) => {
    setLoading(true);
    const userId = session.user.id;

    // Validar telefone antes de limpar
    const cleanedPhoneNumber = data.phone_number.replace(/\D/g, '');
    if (!cleanedPhoneNumber || cleanedPhoneNumber.length < 10) {
      showError('Telefone é obrigatório e deve ter pelo menos 10 dígitos.');
      setLoading(false);
      return;
    }

    // Clean cpf for database storage
    const cleanedCpf = data.cpf.replace(/\D/g, '');

    try {
      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          phone_number: cleanedPhoneNumber,
          cpf: cleanedCpf,
          birth_date: data.birth_date,
          gender: data.gender,
          avatar_url: data.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (profileError) {
        throw profileError;
      }

      // Update auth.users.user_metadata (important for handle_new_user trigger consistency)
      const { error: userMetadataError } = await supabase.auth.updateUser({
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          phone_number: cleanedPhoneNumber,
          cpf: cleanedCpf,
          birth_date: data.birth_date,
          gender: data.gender,
          avatar_url: data.avatar_url,
        },
      });

      if (userMetadataError) {
        throw userMetadataError;
      }

      showSuccess('Perfil atualizado com sucesso!');
      onProfileUpdated(); // Notify parent to refresh data
      onClose();
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error);
      showError('Erro ao atualizar perfil: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
          <DialogDescription>
            Faça alterações no seu perfil aqui. Clique em salvar quando terminar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="first_name" className="text-right">
              Nome
            </Label>
            <Input
              id="first_name"
              {...register('first_name')}
              className="col-span-3"
            />
            {errors.first_name && <p className="col-span-4 text-red-500 text-xs text-right">{errors.first_name.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="last_name" className="text-right">
              Sobrenome
            </Label>
            <Input
              id="last_name"
              {...register('last_name')}
              className="col-span-3"
            />
            {errors.last_name && <p className="col-span-4 text-red-500 text-xs text-right">{errors.last_name.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone_number" className="text-right">
              Telefone *
            </Label>
            <Input
              id="phone_number"
              type="tel"
              placeholder="(XX) XXXXX-XXXX"
              value={phoneNumberValue}
              onChange={handlePhoneNumberChange}
              maxLength={15}
              className="col-span-3"
              required
            />
            {errors.phone_number && <p className="col-span-4 text-red-500 text-xs text-right">{errors.phone_number.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cpf" className="text-right">
              CPF
            </Label>
            <Input
              id="cpf"
              type="text"
              value={cpfValue}
              onChange={handleCpfChange}
              maxLength={14}
              className="col-span-3"
            />
            {errors.cpf && <p className="col-span-4 text-red-500 text-xs text-right">{errors.cpf.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="birth_date" className="text-right">
              Data de Nascimento
            </Label>
            <Input
              id="birth_date"
              type="date"
              {...register('birth_date')}
              className="col-span-3"
            />
            {errors.birth_date && <p className="col-span-4 text-red-500 text-xs text-right">{errors.birth_date.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="gender" className="text-right">
              Gênero
            </Label>
            <Select onValueChange={(value) => setValue('gender', value as 'Masculino' | 'Feminino' | 'Outro', { shouldValidate: true })} value={genderValue}>
              <SelectTrigger id="gender" className="col-span-3">
                <SelectValue placeholder="Selecione o gênero" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Masculino">Masculino</SelectItem>
                <SelectItem value="Feminino">Feminino</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
            {errors.gender && <p className="col-span-4 text-red-500 text-xs text-right">{errors.gender.message}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="avatar_url" className="text-right">
              URL Avatar
            </Label>
            <Input
              id="avatar_url"
              {...register('avatar_url')}
              className="col-span-3"
            />
            {errors.avatar_url && <p className="col-span-4 text-red-500 text-xs text-right">{errors.avatar_url.message}</p>}
          </div>
          <DialogFooter className="flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="!rounded-button whitespace-nowrap"
            >
              Voltar
            </Button>
            <Button type="submit" disabled={loading} className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileEditModal;