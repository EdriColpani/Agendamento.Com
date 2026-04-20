import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const EmailConfirmationPendingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleResendEmail = async () => {
    if (!email) {
      showError('E-mail não encontrado. Por favor, faça o cadastro novamente.');
      return;
    }

    setResending(true);
    setResendSuccess(false);

    try {
      const { data, error } = await supabase.functions.invoke('resend-email-confirmation', {
        body: JSON.stringify({ email }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) {
        console.error('Erro completo da Edge Function:', error);
        let errorMessage = 'Erro ao reenviar e-mail de confirmação.';
        
        // Verificar diferentes formatos de erro
        if (error.context && error.context.data && error.context.data.error) {
          errorMessage = error.context.data.error;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (error.error) {
          errorMessage = error.error;
        }
        
        // Mensagem específica para erro de CORS ou rede
        if (errorMessage.includes('CORS') || errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
          errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente. Se o problema persistir, a Edge Function pode precisar ser deployada.';
        }
        
        showError(errorMessage);
        setResendSuccess(false);
      } else if (data) {
        showSuccess(data.message || 'E-mail de confirmação reenviado com sucesso!');
        setResendSuccess(true);
      } else {
        // Caso não tenha data nem error (situação inesperada)
        showError('Resposta inesperada do servidor. Tente novamente.');
        setResendSuccess(false);
      }
    } catch (error: any) {
      console.error('Erro ao reenviar e-mail:', error);
      let errorMessage = 'Erro ao reenviar e-mail de confirmação: ' + (error.message || 'Erro desconhecido.');
      
      // Verificar se é erro de rede/CORS
      if (error.message && (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.message.includes('network'))) {
        errorMessage = 'Erro de conexão. A Edge Function pode não estar deployada ou há um problema de rede. Verifique sua conexão e tente novamente.';
      }
      
      showError(errorMessage);
      setResendSuccess(false);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 md:p-8">
        <CardHeader className="text-center pb-6">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 dark:bg-slate-800 p-4">
              <Mail className="h-12 w-12 text-primary dark:text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl font-extrabold text-gray-900 dark:text-white">
            Confirmação de E-mail Necessária
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Verifique sua caixa de entrada para confirmar seu cadastro
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Importante: Validação do Cadastro
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Para garantir a segurança e validar seu e-mail, é necessário confirmar seu cadastro clicando no link que foi enviado para:
                </p>
                {email && (
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mt-2">
                    <strong>{email}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  O que fazer agora:
                </p>
                <ol className="list-decimal list-inside mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li>Verifique sua caixa de entrada (e a pasta de spam/lixo eletrônico)</li>
                  <li>Procure por um e-mail de confirmação do PlanoAgenda</li>
                  <li>Clique no link de confirmação no e-mail</li>
                  <li>Você será redirecionado para a tela de seleção de planos</li>
                  <li>Após selecionar um plano, seu sistema será habilitado</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-primary/10 dark:bg-slate-800/80 border border-primary/20 dark:border-slate-600 rounded-lg p-4">
            <p className="text-sm text-amber-900 dark:text-slate-200">
              <strong>⚠️ Atenção:</strong> O sistema só será habilitado após a confirmação do e-mail. 
              Isso é necessário para evitar cadastros com e-mails incorretos e garantir a segurança da sua conta.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
              Não recebeu o e-mail? Verifique sua pasta de spam ou reenvie o e-mail de confirmação.
            </p>
            
            {resendSuccess && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200 text-center">
                  ✓ E-mail reenviado com sucesso! Verifique sua caixa de entrada.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={handleResendEmail}
                disabled={resending || !email}
                className="!rounded-button bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {resending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Reenviando...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Reenviar E-mail
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/login')}
                className="!rounded-button"
              >
                Ir para Login
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="!rounded-button"
              >
                Voltar ao Início
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailConfirmationPendingPage;

