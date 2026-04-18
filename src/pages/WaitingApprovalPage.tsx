/**
 * Página exibida quando o usuário não possui vínculo válido com nenhuma empresa
 * 
 * Esta página é exibida quando:
 * - O usuário não possui registro em user_companies
 * - O usuário não possui registro em collaborators
 * - O usuário foi removido da empresa mas ainda possui conta no auth.users
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { performSignOut } from '@/utils/auth-state';

const WaitingApprovalPage: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await performSignOut();
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao sair.';
      showError(msg);
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <AlertCircle className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Aguardando Aprovação</CardTitle>
          <CardDescription className="mt-2">
            Seu acesso ao sistema está temporariamente indisponível
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-primary/10 p-4 text-sm text-amber-900">
            <p className="font-medium mb-2">O que aconteceu?</p>
            <ul className="list-disc list-inside space-y-1 text-primary">
              <li>Você não possui vínculo ativo com nenhuma empresa</li>
              <li>Seu acesso pode ter sido revogado temporariamente</li>
              <li>Ou sua conta ainda está sendo processada</li>
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-medium mb-2">O que fazer?</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Entre em contato com o administrador da empresa</li>
              <li>Aguarde a aprovação do seu cadastro</li>
              <li>Ou verifique se você foi vinculado à empresa correta</li>
            </ul>
          </div>

          <div className="pt-4">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Fazer Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WaitingApprovalPage;

