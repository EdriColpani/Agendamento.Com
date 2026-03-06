"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const resetPasswordSchema = z.object({
  password: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres."),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

/** Tempo máximo para aguardar o Supabase processar o hash da URL (recovery) antes de redirecionar */
const RECOVERY_WAIT_MS = 3500;
/** Quando há sessão mas sem recovery na URL: aguardar este tempo pelo evento PASSWORD_RECOVERY antes de redirecionar */
const PASSWORD_RECOVERY_EVENT_WAIT_MS = 2500;

const ResetPasswordForm: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const navigate = useNavigate();
  const decidedRef = useRef(false);
  const sessionFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const hashParams = hash ? new URLSearchParams(hash.substring(1)) : null;
    const searchParams = search ? new URLSearchParams(search.substring(1)) : null;
    const fromHash = !!(hashParams?.get('type') === 'recovery' || hashParams?.get('access_token'));
    const fromQuery = !!(searchParams?.get('type') === 'recovery' || searchParams?.get('access_token'));
    const hasRecoveryInUrl = fromHash || fromQuery;

    const redirectToLogin = (message: string) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      setLoading(false);
      showError(message);
      navigate('/login', { replace: true });
    };

    const acceptRecovery = () => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      setLoading(false);
      setIsRecoverySession(true);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (decidedRef.current) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        acceptRecovery();
      }
      if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session && !hasRecoveryInUrl)) {
        if (!hasRecoveryInUrl) redirectToLogin('Sessão de redefinição de senha inválida ou expirada. Por favor, solicite um novo link.');
      }
    });

    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        redirectToLogin('Erro ao verificar sessão. Tente solicitar um novo link.');
        return;
      }
      if (session?.access_token) {
        const params = new URLSearchParams(window.location.hash?.substring(1) || '');
        const isRecoveryType = params.get('type') === 'recovery' || hasRecoveryInUrl;
        if (isRecoveryType) {
          acceptRecovery();
          return;
        }
        // Sessão existe mas URL não tem recovery (hash pode ter sido consumido). Aguardar evento PASSWORD_RECOVERY antes de redirecionar.
        if (sessionFallbackTimerRef.current) clearTimeout(sessionFallbackTimerRef.current);
        sessionFallbackTimerRef.current = setTimeout(() => {
          if (decidedRef.current) return;
          redirectToLogin('Sessão inválida para redefinição de senha. Por favor, solicite um novo link.');
        }, PASSWORD_RECOVERY_EVENT_WAIT_MS);
        return;
      }
      if (!hasRecoveryInUrl) {
        redirectToLogin('Sessão de redefinição de senha inválida ou expirada. Por favor, solicite um novo link.');
      }
    };

    if (hasRecoveryInUrl) {
      checkSession();
      const t = setTimeout(() => {
        if (decidedRef.current) return;
        checkSession();
        if (decidedRef.current) return;
        redirectToLogin('Sessão de redefinição de senha inválida ou expirada. Por favor, solicite um novo link.');
      }, RECOVERY_WAIT_MS);
      return () => {
        clearTimeout(t);
        if (sessionFallbackTimerRef.current) clearTimeout(sessionFallbackTimerRef.current);
        authListener.subscription.unsubscribe();
      };
    }

    checkSession();
    return () => {
      if (sessionFallbackTimerRef.current) clearTimeout(sessionFallbackTimerRef.current);
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        throw error;
      }

      showSuccess('Sua senha foi redefinida com sucesso! Faça login com sua nova senha.');
      navigate('/login', { replace: true });
    } catch (error: any) {
      console.error("Erro ao redefinir senha:", error);
      showError('Erro ao redefinir senha: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !isRecoverySession) {
    return (
      <div className="text-center text-gray-700 dark:text-gray-300">
        Verificando sessão de redefinição de senha...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="password">Nova Senha</Label>
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
        <Label htmlFor="confirm-password">Confirme a Nova Senha</Label>
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
        className="w-full !rounded-button whitespace-nowrap bg-yellow-600 hover:bg-yellow-700 text-black"
        disabled={loading}
      >
        {loading ? 'Redefinindo...' : 'Redefinir Senha'}
      </Button>
      <div className="text-center text-sm mt-4">
        <Link to="/login" className="text-yellow-600 hover:underline">
          Voltar para o Login
        </Link>
      </div>
    </form>
  );
};

export default ResetPasswordForm;