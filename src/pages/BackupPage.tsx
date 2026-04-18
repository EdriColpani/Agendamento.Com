import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Database, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

const BackupPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const handleCreateBackup = async () => {
    if (!session) {
      showError('Você precisa estar logado para criar um backup.');
      return;
    }

    setLoading(true);
    try {
      // Chamar a Edge Function para criar o backup
      const { data, error } = await supabase.functions.invoke('create-backup', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      // Se a resposta for um blob (arquivo), fazer download
      if (data instanceof Blob || (typeof data === 'string' && data.startsWith('--'))) {
        // Criar um blob a partir dos dados
        const blob = data instanceof Blob 
          ? data 
          : new Blob([data], { type: 'application/sql' });
        
        // Criar URL temporária para download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        // Gerar nome do arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const fileName = `backup-tipoagenda-${timestamp}.sql`;
        
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        setLastBackup(new Date().toLocaleString('pt-BR'));
        showSuccess('Backup criado e baixado com sucesso!');
      } else {
        // Se não for blob, pode ser JSON com erro
        throw new Error('Formato de resposta inesperado do servidor.');
      }
    } catch (error: any) {
      console.error('Erro ao criar backup:', error);
      
      // Tentar extrair mensagem de erro
      let errorMessage = 'Erro ao criar backup.';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBackup = async () => {
    if (!session) {
      showError('Você precisa estar logado para baixar um backup.');
      return;
    }

    setLoading(true);
    try {
      // Fazer requisição direta para a Edge Function
      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-backup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseAnonKey,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
      }

      // Obter o conteúdo como texto (SQL)
      const backupContent = await response.text();
      
      // Criar blob e fazer download
      const blob = new Blob([backupContent], { type: 'application/sql' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `backup-tipoagenda-${timestamp}.sql`;
      
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setLastBackup(new Date().toLocaleString('pt-BR'));
      showSuccess('Backup criado e baixado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao criar backup:', error);
      showError('Erro ao criar backup: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Dashboard
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Backup do Banco de Dados</h1>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            Criar Backup do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2">Informações sobre o Backup</h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>O backup inclui todas as tabelas principais do sistema</li>
                  <li>O arquivo será salvo no formato SQL (.sql)</li>
                  <li>O download será iniciado automaticamente após a criação</li>
                  <li>Apenas administradores globais podem criar backups</li>
                </ul>
              </div>
            </div>
          </div>

          {lastBackup && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm text-green-800">
                  <strong>Último backup criado:</strong> {lastBackup}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <Button
              onClick={handleDownloadBackup}
              disabled={loading}
              className="!rounded-button bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 text-base flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Criando Backup...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Criar e Baixar Backup
                </>
              )}
            </Button>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-900 mb-2">Conteúdo do backup completo:</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div>
                <strong className="text-gray-900">1. Políticas RLS (Row Level Security):</strong>
                <p className="ml-4">Todas as políticas de segurança de nível de linha exportadas automaticamente</p>
              </div>
              <div>
                <strong className="text-gray-900">2. Views:</strong>
                <p className="ml-4">Todas as views do banco de dados (ex: auth_users) exportadas automaticamente</p>
              </div>
              <div>
                <strong className="text-gray-900">3. Functions e Procedures:</strong>
                <p className="ml-4">Todas as funções SQL (ex: get_user_context, assign_user_to_company) exportadas automaticamente</p>
              </div>
              <div>
                <strong className="text-gray-900">4. Triggers:</strong>
                <p className="ml-4">Todos os triggers configurados exportados automaticamente</p>
              </div>
              <div>
                <strong className="text-gray-900">5. Schema das Tabelas (CREATE TABLE):</strong>
                <p className="ml-4">Estrutura completa de todas as tabelas incluindo: colunas, tipos de dados, constraints, Primary Keys, Foreign Keys, Unique e Check constraints</p>
              </div>
              <div>
                <strong className="text-gray-900">6. Dados das Tabelas:</strong>
                <p className="ml-4">Dados de todas as tabelas principais (companies, users, collaborators, clients, appointments, services, cash_movements, subscription_plans, company_subscriptions, role_types, user_companies, type_user, profiles, e mais)</p>
              </div>
              <div>
                <strong className="text-gray-900">7. Edge Functions (referência):</strong>
                <p className="ml-4">Lista das Edge Functions. O código deve ser exportado manualmente da pasta <code className="bg-gray-100 px-1 rounded">supabase/functions/</code> do projeto</p>
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mt-4">
              <p className="text-xs text-amber-900">
                <strong>Nota:</strong> Para que as políticas RLS, views, functions e triggers sejam exportadas automaticamente, 
                é necessário executar a migration <code className="bg-primary/10 px-1 rounded">20260209_create_backup_helper_function.sql</code> no Supabase.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupPage;

