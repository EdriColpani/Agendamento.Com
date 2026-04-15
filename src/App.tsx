import React from 'react'; // Adicionando importação explícita do React
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import { SessionContextProvider, useSession } from "./components/SessionContextProvider";
import MainApplication from "./components/MainApplication";
import ProfilePage from "./pages/ProfilePage";
import IndexPage from "./pages/Index"; // Importar IndexPage
import CompanyRegistrationPage from "./pages/CompanyRegistrationPage";
import DashboardPage from "./pages/DashboardPage";
import AgendamentosPage from "./pages/AgendamentosPage";
import ClientesPage from "./pages/ClientesPage";
import ColaboradoresPage from "./pages/ColaboradoresPage";
import FinanceiroPage from "./pages/FinanceiroPage";
import EstoquePage from "./pages/EstoquePage";
import RelatoriosPage from "./pages/RelatoriosPage";
import FidelidadePage from "./pages/FidelidadePage";
import NovoAgendamentoPage from "./pages/NovoAgendamentoPage";
import NovoClientePage from "./pages/NovoClientePage";
import FecharCaixaPage from "./pages/FecharCaixaPage";
// import SettingsPage from "./pages/SettingsPage"; // Removed
import ContractRegistrationPage from "./pages/ContractRegistrationPage";
import SegmentManagementPage from "./pages/SegmentManagementPage";
import ServicesPage from "./pages/ServicesPage";
import CourtsManagementPage from "./pages/CourtsManagementPage";
import CourtWorkingHoursPage from "./pages/CourtWorkingHoursPage";
import CourtAgendaPage from "./pages/CourtAgendaPage";
import CourtSlotPriceBandsPage from "./pages/CourtSlotPriceBandsPage";
import CourtReservationsListPage from "./pages/CourtReservationsListPage";
import PublicCourtBookingPage from "./pages/PublicCourtBookingPage";
import ServiceFormPage from "./pages/ServiceFormPage";
import EditClientPage from "./pages/EditClientPage";
import CollaboratorFormPage from "./pages/CollaboratorFormPage";
import CollaboratorSchedulePage from "./pages/CollaboratorSchedulePage";
import EditAgendamentoPage from "./pages/EditAgendamentoPage";
import ClientAppointmentPage from "./pages/ClientAppointmentPage";
import ClientAppointmentsPage from "./pages/ClientAppointmentsPage";
import ProductFormPage from "./pages/ProductFormPage";
import AdminDashboard from "./pages/AdminDashboard";
import PlanManagementPage from "./pages/PlanManagementPage";
import ContractManagementPage from "./pages/ContractManagementPage";
import SubscriptionPlansPage from "./pages/SubscriptionPlansPage";
import PlanFeaturesManagementPage from "./pages/PlanFeaturesManagementPage"; // Importar nova página de gerenciamento de funcionalidades de planos
import ApiKeysPage from "./pages/ApiKeysPage"; // Import new page
import SubscriptionExpiredPage from "./pages/SubscriptionExpiredPage"; // Importar página de expiração
import CompanyManagementPage from "./pages/CompanyManagementPage"; // Import new page
import CompanyDetailsPage from "./pages/CompanyDetailsPage"; // Import new page
import UserManagementPage from "./pages/UserManagementPage"; // Import new page
import UserDetailsPage from "./pages/UserDetailsPage"; // Import new page
import ContactRequestsPage from "./pages/ContactRequestsPage"; // Importar nova página
import AdminCouponManagementPage from "./pages/AdminCouponManagementPage"; // Importar nova página
import CouponUsageReportPage from "./pages/CouponUsageReportPage"; // Importar nova página
import UnifiedRegistrationPage from "./pages/UnifiedRegistrationPage"; // Importar nova página
import EmailConfirmationPendingPage from "./pages/EmailConfirmationPendingPage"; // Importar página de aviso de confirmação de email
import AreaDeAtuacaoPage from "./pages/AreaDeAtuacaoPage"; // Importar nova página
import PaymentAttemptsPage from "./pages/PaymentAttemptsPage"; // Importar nova página
import CourtBookingTimeoutHealthPage from "./pages/CourtBookingTimeoutHealthPage";
import ConfigPage from "./pages/ConfigPage"; // Importar nova página de configurações
import GuestAppointmentPage from "./pages/GuestAppointmentPage"; // Importar nova página de agendamento para convidados
import GuestAppointmentConfirmationPage from "./pages/GuestAppointmentConfirmationPage";
import BannerManagementPage from "./pages/BannerManagementPage"; // Importar nova página de gerenciamento de banners
import CollaboratorServicesPage from "./pages/CollaboratorServicesPage";
import NovaTransacaoPage from "./pages/NovaTransacaoPage";
import CommissionPaymentPage from "./pages/CommissionPaymentPage";
import CashClosuresPage from "./pages/CashClosuresPage";
import CompanySelectionPage from "./pages/CompanySelectionPage";
import EditMyCompanyPage from "./pages/EditMyCompanyPage";
import WhatsAppMessagingPage from "./pages/WhatsAppMessagingPage"; // Importar nova página de mensagens WhatsApp
import WhatsAppProviderManagementPage from "./pages/WhatsAppProviderManagementPage"; // Importar nova página de gerenciamento de provedores WhatsApp
import WhatsAppMessageQueuePage from "./pages/WhatsAppMessageQueuePage"; // Importar página de gerenciamento da fila de mensagens WhatsApp
import RoleTypesManagementPage from "./pages/RoleTypesManagementPage"; // Importar nova página de gerenciamento de perfis (roles)
import MenuManagementPage from "./pages/MenuManagementPage"; // Importar nova página de gerenciamento de menus
import MenuPermissionsPage from "./pages/MenuPermissionsPage"; // Importar nova página de permissões de menu
import BackupPage from "./pages/BackupPage"; // Importar nova página de backup
import { useIsCompanyAdmin } from "./hooks/useIsCompanyAdmin";
import { useIsProprietario } from "./hooks/useIsProprietario";
import { useIsGlobalAdmin } from "./hooks/useIsGlobalAdmin";
import { useIsClient } from "./hooks/useIsClient";
import { useIsCollaborator } from "./hooks/useIsCollaborator";
import ContractList from "./components/ContractList";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ColaboradorAgendamentosPage from "./pages/ColaboradorAgendamentosPage";
import WaitingApprovalPage from "./pages/WaitingApprovalPage"; // Importar página de aprovação pendente
import HelpPage from "./pages/HelpPage"; // Importar página de ajuda

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useSession();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Verificar se o email está confirmado
  // No Supabase, email_confirmed_at ou confirmed_at indica se o email foi confirmado
  const emailConfirmed = session.user.email_confirmed_at || session.user.confirmed_at;
  
  if (!emailConfirmed) {
    // Redirecionar para página de aviso se email não estiver confirmado
    return <Navigate to={`/email-confirmation-pending?email=${encodeURIComponent(session.user.email || '')}`} replace />;
  }

  return <>{children}</>;
};

const GlobalAdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const { loading: sessionLoading } = useSession();

  if (sessionLoading || loadingGlobalAdminCheck) {
    return <div className="min-h-screen flex items-center justify-center">Verificando permissões de administrador global...</div>;
  }

  if (!isGlobalAdmin) {
    return <Navigate to="/" replace />; // Redirect to root if not global admin
  }

  return <>{children}</>;
};

const CompanyAdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isProprietario, loadingProprietarioCheck } = useIsProprietario();
  const { loading: sessionLoading } = useSession();

  if (sessionLoading || loadingProprietarioCheck) {
    return <div className="min-h-screen flex items-center justify-center">Verificando permissões de proprietário da empresa...</div>;
  }

  if (!isProprietario) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const ClientProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isClient, loadingClientCheck } = useIsClient();
  const { loading: sessionLoading } = useSession();

  if (sessionLoading || loadingClientCheck) {
    return <div className="min-h-screen flex items-center justify-center">Verificando permissões de cliente...</div>;
  }

  if (!isClient) {
    // If not a client, redirect to a more appropriate page or login
    return <Navigate to="/" replace />; // Or /login, or /dashboard if they are another role
  }

  return <>{children}</>;
};

const CollaboratorProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isCollaborator, loading: loadingCollaboratorCheck } = useIsCollaborator();
  const { loading: sessionLoading } = useSession();

  if (sessionLoading || loadingCollaboratorCheck) {
    return <div className="min-h-screen flex items-center justify-center">Verificando permissões de colaborador...</div>;
  }

  if (!isCollaborator) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionContextProvider>
          <Routes>
            <Route path="/" element={<IndexPage />} />

            {/* Rotas de autenticação (sem layout MainApplication) */}
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage />} />
            <Route path="/reset-password" element={<AuthPage />} />
            <Route path="/forgot-password" element={<AuthPage />} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            
            {/* Rota de Cadastro Unificado (Nova) */}
            <Route path="/register-professional" element={<UnifiedRegistrationPage />} />
            
            {/* Rota de Aviso de Confirmação de Email */}
            <Route path="/email-confirmation-pending" element={<EmailConfirmationPendingPage />} />
            
            {/* Rota de Aguardando Aprovação (usuário sem vínculo válido) */}
            <Route path="/waiting-approval" element={<ProtectedRoute><WaitingApprovalPage /></ProtectedRoute>} />

            {/* NOVAS ROTAS: Agendamento para Convidados */}
            <Route path="/guest-appointment/:companyId" element={<GuestAppointmentPage />} />
            <Route path="/reservar-quadra/:companyId" element={<PublicCourtBookingPage />} />
            <Route path="/agendamento-confirmado/:appointmentId" element={<GuestAppointmentConfirmationPage />} />

            {/* Rota do Admin Global (sem layout MainApplication) */}
            <Route path="/admin-dashboard" element={<GlobalAdminProtectedRoute><AdminDashboard /></GlobalAdminProtectedRoute>} />
            {/* Rotas de gerenciamento de contratos e segmentos, agora aninhadas sob /admin-dashboard */}
            <Route path="/admin-dashboard/contracts" element={<GlobalAdminProtectedRoute><ContractManagementPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/new-contract" element={<GlobalAdminProtectedRoute><ContractRegistrationPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/edit-contract/:contractId" element={<GlobalAdminProtectedRoute><ContractRegistrationPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/segments" element={<GlobalAdminProtectedRoute><SegmentManagementPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/areas-de-atuacao" element={<GlobalAdminProtectedRoute><AreaDeAtuacaoPage /></GlobalAdminProtectedRoute>} /> {/* NOVA ROTA */}
            {/* Rotas de gerenciamento de planos */}
            <Route path="/admin-dashboard/plans" element={<GlobalAdminProtectedRoute><PlanManagementPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/plans/:planId/features" element={<GlobalAdminProtectedRoute><PlanFeaturesManagementPage /></GlobalAdminProtectedRoute>} /> {/* NOVA ROTA */}
            {/* Rotas de gerenciamento de chaves de API */}
            <Route path="/admin-dashboard/api-keys" element={<GlobalAdminProtectedRoute><ApiKeysPage /></GlobalAdminProtectedRoute>} />
            {/* Rota de gerenciamento de empresas */}
            <Route path="/admin-dashboard/companies" element={<GlobalAdminProtectedRoute><CompanyManagementPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/companies/details/:companyId" element={<GlobalAdminProtectedRoute><CompanyDetailsPage /></GlobalAdminProtectedRoute>} />
            {/* Rota de gerenciamento de usuários */}
            <Route path="/admin-dashboard/users" element={<GlobalAdminProtectedRoute><UserManagementPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/users/details/:userId" element={<GlobalAdminProtectedRoute><UserDetailsPage /></GlobalAdminProtectedRoute>} />
            {/* Rota de solicitações de contato */}
            <Route path="/admin-dashboard/contact-requests" element={<GlobalAdminProtectedRoute><ContactRequestsPage /></GlobalAdminProtectedRoute>} />
            {/* Rota de gerenciamento de cupons administrativos */}
            <Route path="/admin-dashboard/admin-coupons" element={<GlobalAdminProtectedRoute><AdminCouponManagementPage /></GlobalAdminProtectedRoute>} />
            {/* Rota de relatório de uso de cupons */}
            <Route path="/admin-dashboard/coupon-usage-report" element={<GlobalAdminProtectedRoute><CouponUsageReportPage /></GlobalAdminProtectedRoute>} />
            {/* NOVA ROTA: Relatório de Tentativas de Pagamento */}
            <Route path="/admin-dashboard/payment-attempts" element={<GlobalAdminProtectedRoute><PaymentAttemptsPage /></GlobalAdminProtectedRoute>} />
            <Route path="/admin-dashboard/court-booking-timeout-health" element={<GlobalAdminProtectedRoute><CourtBookingTimeoutHealthPage /></GlobalAdminProtectedRoute>} />
            {/* NOVA ROTA: Gerenciamento de Banners Globais */}
            <Route path="/admin-dashboard/global-banners" element={<GlobalAdminProtectedRoute><BannerManagementPage /></GlobalAdminProtectedRoute>} />
            {/* NOVA ROTA: Gerenciamento de Provedores WhatsApp */}
            <Route path="/admin-dashboard/whatsapp-providers" element={<GlobalAdminProtectedRoute><WhatsAppProviderManagementPage /></GlobalAdminProtectedRoute>} />
            {/* NOVA ROTA: Gestão de Perfis (Roles) */}
            <Route path="/admin-dashboard/role-types" element={<GlobalAdminProtectedRoute><RoleTypesManagementPage /></GlobalAdminProtectedRoute>} />
            {/* NOVA ROTA: Gestão de Menus */}
            <Route path="/admin-dashboard/menus" element={<GlobalAdminProtectedRoute><MenuManagementPage /></GlobalAdminProtectedRoute>} />
            {/* NOVA ROTA: Backup do Banco de Dados */}
            <Route path="/admin-dashboard/backup" element={<GlobalAdminProtectedRoute><BackupPage /></GlobalAdminProtectedRoute>} />


            {/* Rotas da aplicação (com layout MainApplication) */}
            <Route path="/" element={<MainApplication />}>
              <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="register-company" element={<ProtectedRoute><CompanyRegistrationPage /></ProtectedRoute>} />
              
              {/* Rotas de Cliente (protegidas por ClientProtectedRoute) */}
              <Route path="agendar/:companyId" element={<ClientProtectedRoute><ClientAppointmentPage /></ClientProtectedRoute>} />
              <Route path="meus-agendamentos" element={<ClientProtectedRoute><ClientAppointmentsPage /></ClientProtectedRoute>} />
              <Route path="selecionar-empresa" element={<ClientProtectedRoute><CompanySelectionPage /></ClientProtectedRoute>} />

              {/* Rotas de Colaborador (protegidas por CollaboratorProtectedRoute) */}
              <Route path="colaborador/agendamentos" element={<CollaboratorProtectedRoute><ColaboradorAgendamentosPage /></CollaboratorProtectedRoute>} />

              {/* Rotas do Dashboard (protegidas) */}
              <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="agendamentos/:companyId" element={<ProtectedRoute><AgendamentosPage /></ProtectedRoute>} />
              <Route path="agendamentos/edit/:appointmentId" element={<ProtectedRoute><EditAgendamentoPage /></ProtectedRoute>} />
              <Route path="quadras" element={<ProtectedRoute><CourtsManagementPage /></ProtectedRoute>} />
              <Route path="quadras/horarios" element={<ProtectedRoute><CourtWorkingHoursPage /></ProtectedRoute>} />
              <Route path="quadras/agenda" element={<ProtectedRoute><CourtAgendaPage /></ProtectedRoute>} />
              <Route path="quadras/precos" element={<ProtectedRoute><CourtSlotPriceBandsPage /></ProtectedRoute>} />
              <Route path="quadras/reservas" element={<ProtectedRoute><CourtReservationsListPage /></ProtectedRoute>} />
              <Route path="servicos" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
              <Route path="servicos/new" element={<ProtectedRoute><ServiceFormPage /></ProtectedRoute>} />
              <Route path="servicos/edit/:serviceId" element={<ProtectedRoute><ServiceFormPage /></ProtectedRoute>} />
              <Route path="clientes" element={<ProtectedRoute><ClientesPage /></ProtectedRoute>} />
              <Route path="clientes/edit/:clientId" element={<ProtectedRoute><EditClientPage /></ProtectedRoute>} />
              <Route path="colaboradores" element={<ProtectedRoute><ColaboradoresPage /></ProtectedRoute>} />
              <Route path="colaboradores/new" element={<ProtectedRoute><CollaboratorFormPage /></ProtectedRoute>} />
              <Route path="colaboradores/edit/:collaboratorId" element={<ProtectedRoute><CollaboratorFormPage /></ProtectedRoute>} />
              <Route path="colaboradores/:collaboratorId/schedule" element={<ProtectedRoute><CollaboratorSchedulePage /></ProtectedRoute>} />
              <Route path="colaboradores/:collaboratorId/servicos" element={<ProtectedRoute><CollaboratorServicesPage /></ProtectedRoute>} />
              <Route path="financeiro" element={<ProtectedRoute><FinanceiroPage /></ProtectedRoute>} />
              <Route path="financeiro/pagamento-comissoes" element={<ProtectedRoute><CommissionPaymentPage /></ProtectedRoute>} />
              <Route path="financeiro/fechamentos" element={<ProtectedRoute><CashClosuresPage /></ProtectedRoute>} />
              <Route path="estoque" element={<ProtectedRoute><EstoquePage /></ProtectedRoute>} />
              <Route path="estoque/new" element={<ProtectedRoute><ProductFormPage /></ProtectedRoute>} />
              <Route path="estoque/edit/:productId" element={<ProtectedRoute><ProductFormPage /></ProtectedRoute>} />
              <Route path="relatorios" element={<ProtectedRoute><RelatoriosPage /></ProtectedRoute>} />
              <Route path="fidelidade" element={<ProtectedRoute><FidelidadePage /></ProtectedRoute>} />
              <Route path="planos" element={<ProtectedRoute><SubscriptionPlansPage /></ProtectedRoute>} />
              <Route path="config" element={<ProtectedRoute><ConfigPage /></ProtectedRoute>} /> {/* NOVA ROTA DE CONFIGURAÇÃO */}
              <Route path="help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} /> {/* ROTA DE AJUDA */}
              <Route path="mensagens-whatsapp" element={<CompanyAdminProtectedRoute><WhatsAppMessagingPage /></CompanyAdminProtectedRoute>} /> {/* ROTA PARA GESTÃO DE MENSAGENS WHATSAPP */}
              <Route path="mensagens-whatsapp/gerenciar-mensagens" element={<CompanyAdminProtectedRoute><WhatsAppMessageQueuePage /></CompanyAdminProtectedRoute>} /> {/* ROTA PARA GERENCIAR FILA DE MENSAGENS WHATSAPP */}
              <Route path="empresa/editar" element={<CompanyAdminProtectedRoute><EditMyCompanyPage /></CompanyAdminProtectedRoute>} /> {/* ROTA PARA GESTORES EDITAREM DADOS DA EMPRESA */}
              <Route path="menu-permissions" element={<CompanyAdminProtectedRoute><MenuPermissionsPage /></CompanyAdminProtectedRoute>} /> {/* ROTA PARA PROPRIETÁRIOS GERENCIAREM PERMISSÕES DE MENU */}

              {/* Rotas de formulários específicos (protegidas) */}
              <Route path="novo-agendamento/:companyId" element={<ProtectedRoute><NovoAgendamentoPage /></ProtectedRoute>} />
              <Route path="novo-cliente" element={<ProtectedRoute><NovoClientePage /></ProtectedRoute>} />
              <Route path="nova-transacao" element={<ProtectedRoute><NovaTransacaoPage /></ProtectedRoute>} />
              <Route path="fechar-caixa" element={<ProtectedRoute><FecharCaixaPage /></ProtectedRoute>} />

              {/* A rota /settings não existe mais, suas funcionalidades foram movidas */}
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;