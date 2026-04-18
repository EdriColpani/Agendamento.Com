import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';

const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Normalizar email (trim + toLowerCase) para garantir consistência
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: normalizedEmail, 
      password 
    });
    if (error) {
      console.error("Erro no login:", error); // Adicionado para depuração
      // Traduzir mensagem de erro de credenciais inválidas para português
      const isInvalidCredentials = 
        error.message.toLowerCase().includes('invalid login credentials') || 
        error.message.toLowerCase().includes('invalid') && error.message.toLowerCase().includes('credentials') ||
        error.status === 400 || 
        error.code === 'invalid_credentials';
      
      const errorMessage = isInvalidCredentials 
        ? 'Usuário/Senha inválido'
        : error.message;
      showError(errorMessage);
    } else {
      // Verificar se o usuário tem senha temporária
      if (data?.user?.user_metadata?.is_temporary_password === true) {
        // Redirecionar para página de troca de senha
        navigate('/change-password?temporary=true', { replace: true });
      } else {
        // Success message handled by SessionContextProvider
        navigate('/'); // Redireciona para a rota raiz
      }
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <Button
        type="submit"
        className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={loading}
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>
      <div className="text-center text-sm mt-4">
        <Link to="/forgot-password" className="text-primary hover:underline">
          Esqueceu sua senha?
        </Link>
      </div>
      <div className="text-center text-sm mt-2">
        Não tem uma conta?{' '}
        <Link to="/signup" className="text-primary hover:underline">
          Cadastrar
        </Link>
      </div>
    </form>
  );
};

export default LoginForm;