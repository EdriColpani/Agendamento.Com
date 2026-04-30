import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { performSignOut } from '@/utils/auth-state';
import { supabase } from '@/integrations/supabase/client';
import { Users, Building, DollarSign, FileText, Tags, LogOut, Key, MailCheck, Tag, BarChart, Zap, CreditCard, Image as ImageIcon, MessageSquare, UserCog, Menu, Database, AlertTriangle, Share2 } from 'lucide-react'; // Importando ícones do dashboard
import RecentAuditLogs from '@/components/RecentAuditLogs';

// Componente auxiliar para padronizar os cards de gerenciamento
interface ManagementCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  buttonText: string;
  buttonColor: string;
  onClick: () => void;
}

const ManagementCard: React.FC<ManagementCardProps> = ({ title, description, icon, buttonText, buttonColor, onClick }) => (
  <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 flex flex-col justify-between">
    <CardHeader>
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <CardTitle className="text-gray-900 dark:text-white text-xl">{title}</CardTitle>
      </div>
      <p className="text-gray-700 dark:text-gray-300 text-sm">{description}</p>
    </CardHeader>
    <CardContent>
      <Button 
        className={`!rounded-button whitespace-nowrap w-full text-white font-semibold py-2.5 text-base ${buttonColor}`}
        onClick={onClick}
      >
        {buttonText}
      </Button>
    </CardContent>
  </Card>
);

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const [whatsAppPendingDue, setWhatsAppPendingDue] = useState(0);
  const [lastWorkerStatus, setLastWorkerStatus] = useState<string>('NO_RUN');
  const [lastWorkerExecutionTime, setLastWorkerExecutionTime] = useState<string | null>(null);

  const fetchWhatsAppOperationalHealth = useCallback(async () => {
    try {
      const [{ count, error: pendingError }, { data: workerData, error: workerError }] = await Promise.all([
        supabase
          .from('message_send_log')
          .select('*', { count: 'exact', head: true })
          .eq('channel', 'WHATSAPP')
          .eq('status', 'PENDING')
          .lte('scheduled_for', new Date().toISOString()),
        supabase
          .from('worker_execution_logs')
          .select('status, execution_time')
          .order('execution_time', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!pendingError) {
        setWhatsAppPendingDue(count ?? 0);
      }

      if (!workerError) {
        setLastWorkerStatus(workerData?.status ?? 'NO_RUN');
        setLastWorkerExecutionTime(workerData?.execution_time ?? null);
      }
    } catch {
      // dashboard não deve quebrar por erro de telemetria
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && !loadingGlobalAdminCheck) {
      if (!session || !isGlobalAdmin) {
        showError('Acesso negado. Você não é um administrador global.');
        navigate('/', { replace: true }); // Redirect to home if not global admin
      }
    }
  }, [session, sessionLoading, isGlobalAdmin, loadingGlobalAdminCheck, navigate]);

  useEffect(() => {
    if (!sessionLoading && !loadingGlobalAdminCheck && isGlobalAdmin) {
      fetchWhatsAppOperationalHealth();
    }
  }, [sessionLoading, loadingGlobalAdminCheck, isGlobalAdmin, fetchWhatsAppOperationalHealth]);

  useEffect(() => {
    if (!sessionLoading && !loadingGlobalAdminCheck && isGlobalAdmin) {
      const id = window.setInterval(() => {
        fetchWhatsAppOperationalHealth();
      }, 60_000);
      return () => window.clearInterval(id);
    }
    return undefined;
  }, [sessionLoading, loadingGlobalAdminCheck, isGlobalAdmin, fetchWhatsAppOperationalHealth]);

  const lastExecutionAgeMinutes = lastWorkerExecutionTime
    ? Math.floor((Date.now() - new Date(lastWorkerExecutionTime).getTime()) / 60000)
    : null;

  const isWorkerStale = lastExecutionAgeMinutes !== null && lastExecutionAgeMinutes >= 10;
  const healthLevel: 'OK' | 'ATENCAO' | 'CRITICO' =
    whatsAppPendingDue > 0 || isWorkerStale ? (whatsAppPendingDue > 0 && isWorkerStale ? 'CRITICO' : 'ATENCAO') : 'OK';

  const handleLogout = async () => {
    try {
      await performSignOut();
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  if (sessionLoading || loadingGlobalAdminCheck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-700 dark:text-gray-300">Carregando painel de administrador...</p>
      </div>
    );
  }

  if (!isGlobalAdmin) {
    return null; // Should be redirected by useEffect, but a safe fallback
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Dashboard do Administrador Global</h1>
          <Button
            onClick={handleLogout}
            className="!rounded-button whitespace-nowrap bg-red-600 hover:bg-red-700 text-white"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>

        <p className="text-lg text-gray-700 dark:text-gray-300">
          Bem-vindo, Administrador Global! Aqui você pode gerenciar as configurações de alto nível do sistema.
        </p>

        <Card className={whatsAppPendingDue > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/30" : "border-gray-200 dark:border-gray-700 dark:bg-gray-800"}>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {healthLevel !== 'OK' ? (
                      <>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                          Alerta operacional WhatsApp ({healthLevel})
                        </p>
                        <p className="text-sm text-red-700/90 dark:text-red-300/90 mt-1">
                          Existem {whatsAppPendingDue} mensagem(ns) vencida(s) pendente(s). Último status do worker: {lastWorkerStatus}.
                          {isWorkerStale ? ` Sem execução recente há ${lastExecutionAgeMinutes} min.` : ''}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          Saúde operacional WhatsApp
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          Nenhuma pendência vencida no momento. Último status do worker: {lastWorkerStatus}.
                          {lastExecutionAgeMinutes !== null ? ` Última execução há ${lastExecutionAgeMinutes} min.` : ''}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className={`!rounded-button whitespace-nowrap text-white ${whatsAppPendingDue > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                      onClick={() => navigate('/mensagens-whatsapp/gerenciar-mensagens')}
                    >
                      Ver fila WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      className="!rounded-button"
                      onClick={fetchWhatsAppOperationalHealth}
                    >
                      Atualizar diagnóstico
                    </Button>
                  </div>
                </div>

                <div className={`rounded-md border p-3 ${whatsAppPendingDue > 0 ? 'border-red-200 bg-white/70 dark:bg-gray-900/40' : 'border-gray-200 bg-gray-50 dark:bg-gray-900/30'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${whatsAppPendingDue > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    Runbook rápido (ação imediata)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="text-xs text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">1)</span> Abrir fila e confirmar quais mensagens estão vencidas e pendentes.
                    </div>
                    <div className="text-xs text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">2)</span> Validar se o provedor WhatsApp da empresa está ativo e com credenciais corretas.
                    </div>
                    <div className="text-xs text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">3)</span> Após correção, atualizar a tela e verificar redução das pendências vencidas.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      variant="outline"
                      className={`!rounded-button ${whatsAppPendingDue > 0 ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      onClick={() => navigate('/mensagens-whatsapp/gerenciar-mensagens')}
                    >
                      Abrir fila
                    </Button>
                    <Button
                      variant="outline"
                      className={`!rounded-button ${whatsAppPendingDue > 0 ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      onClick={() => navigate('/admin-dashboard/whatsapp-providers')}
                    >
                      Ver provedores
                    </Button>
                    <Button
                      variant="outline"
                      className={`!rounded-button ${whatsAppPendingDue > 0 ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      onClick={fetchWhatsAppOperationalHealth}
                    >
                      Atualizar diagnóstico
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        {/* Group Box: Gerenciamento Principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ManagementCard
            title="Gerenciar Usuários"
            description="Visualize e edite todos os usuários do sistema, incluindo seus papéis e status."
            icon={<Users className="h-6 w-6 text-blue-600" />}
            buttonText="Acessar Gerenciamento de Usuários"
            buttonColor="bg-blue-600 hover:bg-blue-700"
            onClick={() => navigate('/admin-dashboard/users')}
          />

          <ManagementCard
            title="Gerenciar Empresas"
            description="Revise, aprove e gerencie todas as empresas cadastradas na plataforma."
            icon={<Building className="h-6 w-6 text-green-600" />}
            buttonText="Acessar Gerenciamento de Empresas"
            buttonColor="bg-green-600 hover:bg-green-700"
            onClick={() => navigate('/admin-dashboard/companies')}
          />

          <ManagementCard
            title="Gerenciar Planos"
            description="Defina e edite os planos de assinatura disponíveis para as empresas."
            icon={<DollarSign className="h-6 w-6 text-primary" />}
            buttonText="Gerenciar Planos"
            buttonColor="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate('/admin-dashboard/plans')}
          />

          {/* Card: Provedores WhatsApp */}
          <ManagementCard
            title={whatsAppPendingDue > 0 ? `Provedores WhatsApp (${whatsAppPendingDue} alerta)` : "Provedores WhatsApp"}
            description="Configure os provedores de WhatsApp que serão usados para envio automático de mensagens."
            icon={<MessageSquare className="h-6 w-6 text-green-600" />}
            buttonText="Gerenciar Provedores"
            buttonColor="bg-green-600 hover:bg-green-700"
            onClick={() => navigate('/admin-dashboard/whatsapp-providers')}
          />

          {/* Card: Backup do Banco de Dados */}
          <ManagementCard
            title="Backup do Banco de Dados"
            description="Crie e baixe um backup completo do banco de dados do sistema."
            icon={<Database className="h-6 w-6 text-purple-600" />}
            buttonText="Gerar e Baixar Backup"
            buttonColor="bg-purple-600 hover:bg-purple-700"
            onClick={() => navigate('/admin-dashboard/backup')}
          />

          {/* Card: Gerenciamento de Chaves de Pagamento */}
          <ManagementCard
            title="Gerenciamento de Chaves de Pagamento"
            description="Configure chaves de API de pagamento (Mercado Pago, etc.) de forma segura via Supabase Secrets."
            icon={<Key className="h-6 w-6 text-gray-600" />}
            buttonText="Configurar Chaves"
            buttonColor="bg-gray-600 hover:bg-gray-700"
            onClick={() => navigate('/admin-dashboard/api-keys')}
          />

          {/* Card: Gestão de Menus */}
          <ManagementCard
            title="Gestão de Menus"
            description="Crie e gerencie os menus do sistema, vinculando-os a planos de assinatura."
            icon={<Menu className="h-6 w-6 text-purple-600" />}
            buttonText="Gerenciar Menus"
            buttonColor="bg-purple-600 hover:bg-purple-700"
            onClick={() => navigate('/admin-dashboard/menus')}
          />

          <ManagementCard
            title="Operações de Assinatura"
            description="Monitore trocas de plano, falhas, retries e execute ações operacionais com auditoria."
            icon={<BarChart className="h-6 w-6 text-amber-600" />}
            buttonText="Abrir Operações"
            buttonColor="bg-amber-600 hover:bg-amber-700"
            onClick={() => navigate('/admin-dashboard/operacoes-assinatura')}
          />

          <ManagementCard
            title="Adesão e pagamentos de plano"
            description="Acompanhe pagamentos de adesão e renovação de planos: status, valores e referências do gateway."
            icon={<CreditCard className="h-6 w-6 text-indigo-600" />}
            buttonText="Abrir relatório de pagamentos"
            buttonColor="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => navigate('/admin-dashboard/payment-attempts')}
          />

          <ManagementCard
            title="Vendedores externos (assinatura)"
            description="Cadastre representantes, percentual de comissão e gere o link de indicação (?ref=). Separado da comissão de colaboradores."
            icon={<Share2 className="h-6 w-6 text-teal-600" />}
            buttonText="Gerenciar vendedores e links"
            buttonColor="bg-teal-600 hover:bg-teal-700"
            onClick={() => navigate('/admin-dashboard/vendedores-externos')}
          />
        </div>

        {/* Group Box: Configurações Globais */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white pt-4">Configurações Globais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ManagementCard
            title="Gerenciamento de Contratos"
            description="Crie e gerencie modelos de contratos que as empresas devem aceitar no cadastro."
            icon={<FileText className="h-6 w-6 text-purple-600" />}
            buttonText="Gerenciar Contratos"
            buttonColor="bg-purple-600 hover:bg-purple-700"
            onClick={() => navigate('/admin-dashboard/contracts')}
          />
          
          {/* NOVO CARD: Área de Atuação */}
          <ManagementCard
            title="Área de Atuação"
            description="Defina as áreas de atuação (ex: Corte, Manicure) associadas aos segmentos."
            icon={<Zap className="h-6 w-6 text-blue-600" />}
            buttonText="Gerenciar Áreas"
            buttonColor="bg-blue-600 hover:bg-blue-700"
            onClick={() => navigate('/admin-dashboard/areas-de-atuacao')}
          />

          <ManagementCard
            title="Gerenciamento de Segmentos"
            description="Defina e organize os tipos de segmentos para as empresas cadastradas."
            icon={<Tags className="h-6 w-6 text-pink-600" />}
            buttonText="Gerenciar Segmentos"
            buttonColor="bg-pink-600 hover:bg-pink-700"
            onClick={() => navigate('/admin-dashboard/segments')}
          />
          
          <ManagementCard
            title="Cupons Administrativos"
            description="Crie e gerencie cupons de desconto para Proprietários de Empresas."
            icon={<Tag className="h-6 w-6 text-orange-600" />}
            buttonText="Gerenciar Cupons"
            buttonColor="bg-orange-600 hover:bg-orange-700"
            onClick={() => navigate('/admin-dashboard/admin-coupons')}
          />
          
          <ManagementCard
            title="Relatório de Uso de Cupons"
            description="Visualize quais empresas utilizaram cada cupom de desconto administrativo."
            icon={<BarChart className="h-6 w-6 text-cyan-600" />}
            buttonText="Ver Relatório de Uso"
            buttonColor="bg-cyan-600 hover:bg-cyan-700"
            onClick={() => navigate('/admin-dashboard/coupon-usage-report')}
          />

          <ManagementCard
            title="Solicitações de Contato"
            description="Visualize e gerencie as solicitações de contato enviadas por visitantes da Landing Page."
            icon={<MailCheck className="h-6 w-6 text-red-600" />}
            buttonText="Ver Solicitações"
            buttonColor="bg-red-600 hover:bg-red-700"
            onClick={() => navigate('/admin-dashboard/contact-requests')}
          />

          {/* NOVO CARD: Gerenciamento de Banners Globais */}
          <ManagementCard
            title="Gerenciamento de Banners Globais"
            description="Crie e edite banners que serão exibidos globalmente no sistema (máximo de 20 banners)."
            icon={<ImageIcon className="h-6 w-6 text-orange-500" />}
            buttonText="Gerenciar Banners Globais"
            buttonColor="bg-orange-500 hover:bg-orange-600"
            onClick={() => navigate('/admin-dashboard/global-banners')}
          />

          {/* NOVO CARD: Gestão de Perfis (Roles) */}
          <ManagementCard
            title="Gestão de Perfis (Roles)"
            description="Gerencie os tipos de cargos/perfis do sistema e controle sua visibilidade."
            icon={<UserCog className="h-6 w-6 text-blue-600" />}
            buttonText="Gerenciar Perfis"
            buttonColor="bg-blue-600 hover:bg-blue-700"
            onClick={() => navigate('/admin-dashboard/role-types')}
          />

          <ManagementCard
            title="Saúde Arena — Timeout de Pagamento"
            description="Acompanhe execuções do timeout automático de reservas públicas e veja erros/cancelamentos."
            icon={<AlertTriangle className="h-6 w-6 text-amber-600" />}
            buttonText="Abrir Saúde Arena"
            buttonColor="bg-amber-600 hover:bg-amber-700"
            onClick={() => navigate('/admin-dashboard/court-booking-timeout-health')}
          />

          <ManagementCard
            title="Arena — Cancelamentos e Estornos"
            description="Relatório operacional com cancelamentos, motivos e status de estorno da arena."
            icon={<BarChart className="h-6 w-6 text-indigo-600" />}
            buttonText="Abrir Relatório da Arena"
            buttonColor="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => navigate('/admin-dashboard/arena-cancelamentos-estornos')}
          />

          <ManagementCard
            title="Imagens do login Arena"
            description="Envie as quatro fotos exibidas no painel esquerdo da página pública /arena (antes do login)."
            icon={<ImageIcon className="h-6 w-6 text-teal-600" />}
            buttonText="Gerenciar imagens /arena"
            buttonColor="bg-teal-600 hover:bg-teal-700"
            onClick={() => navigate('/admin-dashboard/arena-login-imagens')}
          />

        </div>
        
        {/* Logs de Auditoria Recentes */}
        <RecentAuditLogs />
      </div>
    </div>
  );
};

export default AdminDashboard;