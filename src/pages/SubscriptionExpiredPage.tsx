import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from 'react-router-dom';
import { Check, DollarSign, Clock, LogOut, Lock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { performSignOut } from '@/utils/auth-state';
import { cn } from '@/lib/utils';

export type SubscriptionBlockReason = 'expired' | 'no_subscription' | 'trial_expired';

interface SubscriptionExpiredPageProps {
  endDate: string | null;
  /** Sem plano ainda, ou assinatura já expirou (textos diferentes). */
  reason: SubscriptionBlockReason;
}

const SubscriptionExpiredPage: React.FC<SubscriptionExpiredPageProps> = ({ endDate, reason }) => {
  const navigate = useNavigate();
  const isExpired = reason === 'expired';
  const isTrialExpired = reason === 'trial_expired';
  const isBlocked = isExpired || isTrialExpired;

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
      <Card className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8 text-center">
        <CardHeader className="space-y-3 p-0 pb-4">
          <div
            className={cn(
              'mx-auto flex h-16 w-16 items-center justify-center rounded-full',
              isBlocked ? 'bg-red-100' : 'bg-primary/10',
            )}
          >
            {isBlocked ? (
              <Lock className="h-8 w-8 text-red-600" />
            ) : (
              <DollarSign className="h-8 w-8 text-primary" />
            )}
          </div>
          <CardTitle
            className={cn(
              'text-2xl font-bold sm:text-3xl',
              isBlocked ? 'text-red-600' : 'text-gray-900 dark:text-white',
            )}
          >
            {isTrialExpired
              ? 'Seu teste grátis terminou'
              : isExpired
                ? 'Assinatura expirada'
                : 'Próximo passo: escolha seu plano'}
          </CardTitle>
          <p className="text-base text-gray-600 dark:text-gray-400">
            {isTrialExpired
              ? 'Os 15 dias de teste acabaram. Assine um plano para voltar a criar e editar agendamentos, clientes e demais funções de gestão.'
              : isExpired
                ? 'O acesso às funções de gestão desta empresa foi interrompido após a data de vigência.'
                : 'Sua empresa já está cadastrada. Para liberar o sistema, selecione e ative um plano agora.'}
          </p>
        </CardHeader>

        <CardContent className="space-y-5 p-0 text-left">
          {!isExpired && (
            <ol className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">1. Cadastro da empresa</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Concluído</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">2. Escolher e ativar o plano</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Você está nesta etapa — é obrigatória para usar o sistema.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 opacity-70">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-bold text-gray-500 dark:border-gray-600 dark:bg-gray-800">
                  3
                </span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">3. Usar o sistema completo</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Após o pagamento, dashboard, agenda, clientes e demais menus liberam sozinhos.
                  </p>
                </div>
              </li>
            </ol>
          )}

          {isBlocked && (
            <>
              {endDate && (
                <div className="rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-700">
                  <p className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Clock className="h-4 w-4 shrink-0" />
                    {isTrialExpired ? 'Teste encerrado em:' : 'Término da vigência:'}{' '}
                    <span className="font-bold text-red-600">{formattedEndDate}</span>
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {isTrialExpired
                  ? 'Escolha o plano que você já estava testando (ou outro da lista) para reativar o acesso completo. Enquanto isso, o menu lateral mostra apenas Planos.'
                  : 'Renove o plano para reativar o acesso. Você pode voltar a usar todas as funções logo após a aprovação do pagamento. Enquanto isso, o menu lateral mostra apenas Planos.'}
              </p>
            </>
          )}

          {!isExpired && (
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Até o plano ficar ativo, a barra lateral mostra só <strong>Planos</strong>. Isso é esperado.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button
              className="w-full !rounded-button whitespace-nowrap bg-primary py-2.5 text-base font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate('/planos')}
            >
              <DollarSign className="mr-2 h-5 w-5" />
              {isTrialExpired ? 'Assinar plano agora' : isExpired ? 'Renovar plano' : 'Escolher meu plano agora'}
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
              <LogOut className="mr-2 h-4 w-4" />
              Sair da conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionExpiredPage;
