import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { showSuccess, showError } from '@/utils/toast';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getTargetCompanyId, clearTargetCompanyId } from '@/utils/storage'; // Import storage utils
import { invokeEdgePublicOrThrow } from '@/utils/edge-invoke';

// Esquema de validação com Zod simplificado
const signupSchema = z.object({
  firstName: z.string().min(1, "Nome é obrigatório."),
  lastName: z.string().min(1, "Sobrenome é obrigatório."),
  email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

type SignupFormValues = z.infer<typeof signupSchema>;

const SignupForm: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: SignupFormValues) => {
    setLoading(true);
    const { email, password, firstName, lastName } = data;

    try {
      const responseData = await invokeEdgePublicOrThrow<{
        error?: string;
        emailSent?: boolean;
        emailError?: string;
      }>('signup-client', {
        body: { firstName, lastName, email, password },
      });

      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      // Verificar se o email foi enviado
      if (responseData?.emailSent) {
        showSuccess('Cadastro realizado com sucesso! Email de confirmação foi enviado.');
      } else {
        showError(`Cadastro realizado, mas o e-mail não foi enviado. ${responseData?.emailError || 'Verifique os logs.'}`);
      }

      clearTargetCompanyId(); // Limpar o ID da empresa alvo após o uso

    } catch (error: any) {
      console.error("Erro inesperado no cadastro:", error);
      showError('Erro ao realizar cadastro: ' + (error.message || 'Erro desconhecido.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first-name">Nome</Label>
          <Input
            id="first-name"
            type="text"
            placeholder="Seu nome"
            {...register('firstName')}
            className="mt-1"
          />
          {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
        </div>
        <div>
          <Label htmlFor="last-name">Sobrenome</Label>
          <Input
            id="last-name"
            type="text"
            placeholder="Seu sobrenome"
            {...register('lastName')}
            className="mt-1"
          />
          {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
        </div>
      </div>
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
      
      <div>
        <Label htmlFor="password">Crie uma senha</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          className="mt-1"
        />
        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
      </div>
      <div>
        <Label htmlFor="confirm-password">Confirme a senha</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
          className="mt-1"
        />
        {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
      </div>
      <Button
        type="submit"
        className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={loading}
      >
        {loading ? 'Cadastrando...' : 'Cadastrar'}
      </Button>
      <div className="text-center text-sm mt-4">
        Já tem uma conta?{' '}
        <Link to="/login" className="text-primary hover:underline">
          Entrar
        </Link>
      </div>
    </form>
  );
};

export default SignupForm;