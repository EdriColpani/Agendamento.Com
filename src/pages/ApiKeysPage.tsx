import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Lock, ExternalLink } from 'lucide-react';
import { supabaseUrl } from '@/integrations/supabase/client';

const ApiKeysPage: React.FC = () => {
  const navigate = useNavigate();

  const projectRef = (() => {
    try {
      return new URL(supabaseUrl).hostname.split('.')[0];
    } catch {
      return '';
    }
  })();
  const supabaseSecretsLink = projectRef
    ? `https://app.supabase.com/project/${projectRef}/functions/secrets`
    : 'https://app.supabase.com';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Chaves de Pagamento</h1>
      </div>

      <div className="max-w-3xl space-y-6">
        <Card className="border-red-500 border-2 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <Lock className="h-6 w-6" />
              Aviso de Segurança Crítico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700 mb-4">
              Chaves de API e tokens secretos **NÃO** devem ser armazenados diretamente no banco de dados ou no código do frontend. Para garantir a segurança, eles devem ser configurados como **Supabase Secrets** (Variáveis de Ambiente Seguras) e acessados apenas por Edge Functions.
            </p>
            <p className="text-sm text-red-700 font-semibold">
              Por favor, siga as instruções abaixo para configurar as chaves de pagamento de forma segura.
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Key className="h-6 w-6 text-primary" />
              Instruções de Configuração Segura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-gray-700">
              <li>
                Acesse o console do Supabase e navegue até a seção Edge Functions &gt; Secrets.
                <a href={supabaseSecretsLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 mt-1">
                  Ir para Supabase Secrets <ExternalLink className="h-4 w-4" />
                </a>
              </li>
              <li>
                Adicione as seguintes chaves como novos segredos:
                <ul className="list-disc list-inside ml-4 mt-1 font-mono text-sm bg-gray-100 p-2 rounded">
                  <li>`PAYMENT_API_KEY_PUBLIC` (Chave pública)</li>
                  <li>`PAYMENT_API_KEY_SECRET` (Chave secreta)</li>
                </ul>
              </li>
              <li>
                Esses segredos estarão disponíveis apenas para suas Edge Functions, garantindo que o frontend nunca os veja.
              </li>
              <li>
                Se precisar usar essas chaves no futuro (ex: em uma Edge Function de checkout), acesse-as usando `Deno.env.get('PAYMENT_API_KEY_SECRET')`.
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ApiKeysPage;