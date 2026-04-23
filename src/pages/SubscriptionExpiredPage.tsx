import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from 'react-router-dom';
import { Lock, DollarSign, Clock, LogOut, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { performSignOut } from '@/utils/auth-state';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type SubscriptionBlockReason = 'expired' | 'no_subscription';

interface SubscriptionExpiredPageProps {
  endDate: string | null;
  /** Sem plano ainda, ou assinatura já expirou (textos diferentes). */
  reason: SubscriptionBlockReason;
}

const SubscriptionExpiredPage: React.FC<SubscriptionExpiredPageProps> = ({ endDate, reason }) => {
  const navigate = useNavigate();
  const isExpired = reason === 'expired';

  const formattedEndDate = endDate
    ? format(parseISO(endDate), 'dd/MM/yyyy', { locale: ptBR })
    : '—';

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
          <div
            className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              isExpired ? 'bg-red-100' : 'bg-amber-100'
            }`}
          >
            <Lock className={`h-8 w-8 ${isExpired ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <CardTitle
            className={`text-3xl font-bold ${isExpired ? 'text-red-600' : 'text-amber-700'}`}
          >
            {isExpired ? 'Assinatura expirada' : 'Nenhum plano ativo'}
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {isExpired
              ? 'O acesso às funções de gestão desta empresa foi interrompido após a data de vigência.'
              : 'É necessário assinar um plano para usar o sistema completo (dashboard, clientes, agenda, relatórios e demais menus).'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-left">
          <Alert className="border-primary/30 bg-primary/5 text-left">
            <Info className="h-4 w-4" />
            <AlertTitle className="text-sm">Menu lateral</AlertTitle>
            <AlertDescription className="text-sm text-gray-700 dark:text-gray-300">
              Até existir um plano ativo, a barra lateral mostra apenas <strong>Planos</strong>. Após a confirmação
              do pagamento, o restante do acesso é liberado automaticamente.
            </AlertDescription>
          </Alert>

          {isExpired && endDate && (
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2">
                <Clock className="h-4 w-4 shrink-0" />
                Término da vigência:{' '}
                <span className="font-bold text-red-600">{formattedEndDate}</span>
              </p>
            </div>
          )}

          <p className="text-gray-700 dark:text-gray-300 text-sm">
            {isExpired
              ? 'Renove o plano para reativar o acesso. Você pode voltar a usar todas as funções logo após a aprovação do pagamento.'
              : 'Escolha um plano na próxima tela e conclua o pagamento. Quando a assinatura estiver ativa, não será preciso fazer mais nada: os menus passam a aparecer sozinhos.'}
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base"
              onClick={() => navigate('/planos')}
            >
              <DollarSign className="h-5 w-5 mr-2" />
              Ir para planos
            </Button>
            <Button
              variant="outline"
              className="w-full !rounded-button border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Voltar ao início
            </Button>
            <Button
              variant="link"
              className="w-full text-gray-500 dark:text-gray-400"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair da conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionExpiredPage;
