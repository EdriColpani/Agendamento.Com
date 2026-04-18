"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// Esquema de validação com Zod
const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

const ForgotPasswordForm: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setLoading(true);
    try {
      // Usar Edge Function que envia email via Resend
      const normalizedEmail = data.email.trim().toLowerCase();

      const { error } = await supabase.functions.invoke('send-password-reset-email', {
        body: { email: normalizedEmail },
      });

      if (error) {
        console.error('Erro na Edge Function send-password-reset-email:', error);
        throw error;
      }

      // Mensagem genérica para não expor se o email existe ou não
      showSuccess(
        'Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.'
      );
    } catch (error: any) {
      console.error("Erro ao enviar instruções de redefinição:", error);
      showError('Erro ao enviar instruções. Tente novamente em alguns instantes.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          {...register('email')}
          className="mt-1"
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
      </div>
      <Button
        type="submit"
        className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={loading}
      >
        {loading ? 'Enviando...' : 'Enviar Instruções'}
      </Button>
      <div className="text-center text-sm mt-4">
        <Link to="/login" className="text-primary hover:underline">
          Voltar para o Login
        </Link>
      </div>
    </form>
  );
};

export default ForgotPasswordForm;