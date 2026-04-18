import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from 'react-router-dom';
import { Lock, DollarSign, Clock, LogOut } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { performSignOut } from '@/utils/auth-state';

interface SubscriptionExpiredPageProps {
  endDate: string | null;
}

const SubscriptionExpiredPage: React.FC<SubscriptionExpiredPageProps> = ({ endDate }) => {
  const navigate = useNavigate();
  
  const formattedEndDate = endDate 
    ? format(parseISO(endDate), 'dd/MM/yyyy', { locale: ptBR }) 
    : 'N/A';

  const handleLogout = async () => {
    try {
      await performSignOut();
      window.location.href = '/';
    } catch (error: unknown) {
      console.error('Unexpected error during logout:', error);
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-3xl font-bold text-red-600">
            Assinatura Expirada
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Seu acesso às funcionalidades de gerenciamento da empresa foi suspenso.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2">
              <Clock className="h-4 w-4" />
              Data de Expiração: <span className="font-bold text-red-600">{formattedEndDate}</span>
            </p>
          </div>
          
          <p className="text-gray-700 dark:text-gray-300">
            Para reativar o acesso e continuar gerenciando seus agendamentos, clientes e colaboradores, por favor, renove sua assinatura.
          </p>
          
          <Button
            className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base"
            onClick={() => navigate('/planos')}
          >
            <DollarSign className="h-5 w-5 mr-2" />
            Ver Planos e Renovar
          </Button>
          
          <Button
            variant="link"
            className="w-full text-gray-500 dark:text-gray-400"
            onClick={() => navigate('/dashboard')}
          >
            Voltar para o Dashboard (Acesso Limitado)
          </Button>
          
          <Button
            variant="outline"
            className="w-full !rounded-button border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair e Voltar para o Início
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionExpiredPage;