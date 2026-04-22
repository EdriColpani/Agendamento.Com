import React, { useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { formatPhoneNumberInput } from '@/utils/validation'; // Corrected import path
import { invokeEdgePublic } from '@/utils/edge-invoke';

// Zod schema for contact request
const contactRequestSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  phone_number: z.string()
    .min(1, "Telefone é obrigatório.")
    .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Formato de telefone inválido (ex: (XX) XXXXX-XXXX)"),
  description: z.string().max(500, "Máximo de 500 caracteres.").optional(),
});

type ContactRequestFormValues = z.infer<typeof contactRequestSchema>;

interface ContactRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ContactRequestModal: React.FC<ContactRequestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ContactRequestFormValues>({
    resolver: zodResolver(contactRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      phone_number: '',
      description: '',
    },
  });

  const phoneNumberValue = watch('phone_number');

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reusing the formatting logic from validation utils
    const formattedValue = formatPhoneNumberInput(e.target.value);
    setValue('phone_number', formattedValue, { shouldValidate: true });
  };

  const onSubmit = async (data: ContactRequestFormValues) => {
    setLoading(true);
    
    // Clean phone number for database storage
    const cleanedPhoneNumber = data.phone_number.replace(/\D/g, '');

    try {
      // 1. Insert into contact_requests table
      const { error: insertError } = await supabase
        .from('contact_requests')
        .insert({
          name: data.name,
          email: data.email,
          phone_number: cleanedPhoneNumber,
          description: data.description,
          status: 'pending',
        });

      if (insertError) {
        throw insertError;
      }

      // 2. Call Edge Function to notify administrator
      const edgeResponse = await invokeEdgePublic('send-contact-request-email', {
        body: {
          name: data.name,
          email: data.email,
          phone_number: cleanedPhoneNumber,
          description: data.description,
        },
      });

      if (edgeResponse.error) {
        console.warn('Aviso: Falha ao notificar administrador por e-mail (Edge Function):', edgeResponse.error);
        // Não lançamos erro crítico aqui, pois a solicitação foi salva no DB.
      }

      showSuccess('Sua solicitação foi enviada! Entraremos em contato em breve.');
      reset();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar solicitação de contato:', error);
      showError('Erro ao enviar solicitação: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Solicitar Contato</DialogTitle>
          <DialogDescription>
            Preencha seus dados e entraremos em contato para discutir suas necessidades.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              {...register('name')}
              className="w-full"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail *</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              className="w-full"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone_number">Telefone *</Label>
            <Input
              id="phone_number"
              type="tel"
              value={phoneNumberValue}
              onChange={handlePhoneNumberChange}
              maxLength={15}
              className="w-full"
            />
            {errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (Opcional)</Label>
            <Textarea
              id="description"
              {...register('description')}
              rows={3}
              maxLength={500}
              className="w-full resize-none"
              placeholder="Descreva brevemente o que você precisa..."
            />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
          </div>
          
          <DialogFooter className="mt-6">
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
              {loading ? 'Enviando...' : 'Salvar e Enviar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ContactRequestModal;