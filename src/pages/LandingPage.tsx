import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { performSignOut } from '@/utils/auth-state';
import { showError } from '@/utils/toast';
import { Link, useNavigate } from 'react-router-dom'; // Adicionar Link
import { setTargetCompanyId, getTargetCompanyId } from '@/utils/storage';
import { useSession } from '@/components/SessionContextProvider';
import { useIsClient } from '@/hooks/useIsClient';
import { useIsProprietario } from '@/hooks/useIsProprietario';
import { useIsCompanyAdmin } from '@/hooks/useIsCompanyAdmin';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { CompanySelectionModal } from '@/components/CompanySelectionModal';
import { useLandingPlansWithMenus } from '@/hooks/useLandingPlansWithMenus';
import { useTrialSettings } from '@/hooks/useTrialSettings';
import LandingPlansSection from '@/components/landing/LandingPlansSection';
import {
  BarChart3,
  Check,
  Clock3,
  Clock,
  Menu,
  MessageSquare,
  Phone,
  PhoneCall,
  Volleyball,
  Wallet,
  Zap,
} from 'lucide-react';
import ContactRequestModal from '@/components/ContactRequestModal'; // Importar o novo modal
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"; // Importar DropdownMenu
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BrandHeader from '@/components/brand/BrandHeader';
import LandingFloatingWhatsApp from '@/components/landing/LandingFloatingWhatsApp';
import LandingFaqSection from '@/components/landing/LandingFaqSection';
import LandingClientBookingSection from '@/components/landing/LandingClientBookingSection';
import LandingSegmentsSection from '@/components/landing/LandingSegmentsSection';
import LandingHeroVisual from '@/components/landing/LandingHeroVisual';
import { LANDING_WHATSAPP_URL } from '@/data/landingPageContent';
import { ARENA_LANDING_PATH, ARENA_LOGIN_PATH } from '@/utils/arenaRegistration';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { isClient, loadingClientCheck } = useIsClient();
  const { isProprietario, loadingProprietarioCheck } = useIsProprietario();
  const { isCompanyAdmin, loadingCompanyAdminCheck } = useIsCompanyAdmin();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const { plansWithMenus, loading: loadingPlans } = useLandingPlansWithMenus('service');
  const { trial_enabled: trialEnabled, trial_days_default: trialDays, loading: loadingTrialSettings } =
    useTrialSettings();
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isLoginChoiceModalOpen, setIsLoginChoiceModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isConfirmLogoutDialogOpen, setIsConfirmLogoutDialogOpen] = useState(false);

  const loadingRoles = loadingProprietarioCheck || loadingCompanyAdminCheck || loadingGlobalAdminCheck || loadingClientCheck;

  // NOTA: O redirecionamento pós-login é tratado pelo Index.tsx
  // Esta página não deve fazer redirecionamentos automáticos

  // Logic to open the selection modal if the user is a client and just logged in without a target company

  const handleProfessionalSignup = (planId?: string) => {
    const defaultPlanId = plansWithMenus.length > 0 ? plansWithMenus[0].id : undefined;
    const selectedPlanId = planId ?? defaultPlanId;
    const params = new URLSearchParams();
    if (selectedPlanId) {
      params.set('plan', selectedPlanId);
    }
    if (trialEnabled) {
      params.set('trial', '1');
    }
    const query = params.toString();
    navigate(query ? `/register-professional?${query}` : '/register-professional');
  };

  const primarySignupLabel = trialEnabled
    ? `Começar teste grátis de ${trialDays} dias`
    : 'Cadastrar minha empresa';

  const planSignupLabel = trialEnabled ? `Teste grátis ${trialDays} dias` : 'Cadastrar empresa neste plano';

  const handleCompanySelected = (companyId: string) => {
    setTargetCompanyId(companyId);
    setIsSelectionModalOpen(false);
    navigate(`/agendar/${companyId}`, { replace: true });
  };

  // Funções de scroll para navegação por âncoras
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 128; // Altura do header fixo + folga
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const scrollToPlans = () => scrollToSection('plans-section');
  const scrollToContact = () => scrollToSection('contact-section');
  const scrollToHowItWorks = () => scrollToSection('como-cliente-agenda');

  const goToLoginPath = (path: '/login' | typeof ARENA_LOGIN_PATH) => {
    setIsLoginChoiceModalOpen(false);
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header Customizado para Landing Page */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <BrandHeader
            to="/"
            titleClassName="text-xl font-bold text-gray-900"
            showFullLogoOnDesktop
            officialLogo
            officialLogoClassName="h-14 w-auto max-w-[280px] sm:h-16 sm:max-w-[340px] md:h-16 md:max-w-[380px] shrink-0 object-contain"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          />

          {/* Menu de Navegação - Desktop: Links visíveis, Mobile: Menu hamburger */}
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            <button
              onClick={() => scrollToSection('inicio')}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Início
            </button>
            <button
              onClick={scrollToHowItWorks}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Como funciona
            </button>
            <button
              onClick={() => scrollToSection('beneficios')}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Benefícios
            </button>
            <button
              onClick={() => scrollToSection('plans-section')}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Planos
            </button>
            <button
              onClick={() => scrollToSection('depoimentos')}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Segmentos
            </button>
            <button
              onClick={() => scrollToSection('faq-section')}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              FAQ
            </button>
            <button
              onClick={() => scrollToSection('contact-section')}
              className="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
            >
              Contato
            </button>
          </nav>

          {/* Ações: cadastro é o caminho principal; login só para quem já tem empresa */}
          <div className="flex items-center gap-3">
            {session ? (
              // Usuário logado: dropdown com perfil e sair (funciona em desktop e mobile)
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="!rounded-button flex items-center gap-2">
                    <span className="hidden md:inline text-sm font-medium text-gray-700">Meu Perfil</span>
                    <Menu className="h-5 w-5 md:hidden" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    Meu Perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      await performSignOut();
                      navigate('/');
                    }}
                  >
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <div className="hidden md:flex items-center gap-2 sm:gap-3">
                  <Button
                    variant="ghost"
                    className="!rounded-button text-gray-600 hover:text-gray-900 text-sm"
                    onClick={() => setIsLoginChoiceModalOpen(true)}
                  >
                    Já tenho conta
                  </Button>
                  <Button
                    className="!rounded-button bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                    onClick={() => handleProfessionalSignup()}
                  >
                    {primarySignupLabel}
                  </Button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="!rounded-button md:hidden">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem onClick={() => scrollToSection('inicio')}>
                      Início
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={scrollToHowItWorks}>
                      Como funciona
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('beneficios')}>
                      Benefícios
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('plans-section')}>
                      Planos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('depoimentos')}>
                      Segmentos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('faq-section')}>
                      FAQ
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('contact-section')}>
                      Contato
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="font-semibold text-primary focus:text-primary"
                      onClick={() => handleProfessionalSignup()}
                    >
                      {primarySignupLabel}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsLoginChoiceModalOpen(true)}>
                      Já tenho conta — Entrar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        id="inicio"
        className="relative overflow-hidden bg-gradient-to-br from-amber-50/70 via-white to-emerald-50/40 pt-24 pb-16 sm:pt-28 lg:pb-20"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_70%_-10%,hsl(var(--primary)/0.12),transparent)]"
        />
        <div className="container relative mx-auto grid items-center gap-10 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          {/* Texto principal */}
          <div className="max-w-xl lg:py-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
                Agenda online · WhatsApp automático
              </p>
              {trialEnabled && !loadingTrialSettings && (
                <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 sm:text-sm">
                  Sem cartão · {trialDays} dias grátis
                </span>
              )}
            </div>
            <h1 className="mb-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 md:text-5xl lg:text-[3.25rem]">
              Menos faltas, agenda cheia e controle do negócio em um só lugar
            </h1>
            <p className="mb-6 text-lg leading-relaxed text-gray-600">
              O PlanoAgenda combina <span className="font-semibold text-gray-900">agendamento online 24h</span>,{' '}
              <span className="font-semibold text-gray-900">lembretes automáticos no WhatsApp</span> e gestão
              financeira — do autônomo à arena esportiva.
            </p>
            <ul className="mb-8 space-y-2.5 text-sm text-gray-700">
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>Lembretes automáticos antes de cada atendimento</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>Cliente agenda sozinho pelo link da sua empresa</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>Painel, caixa e relatórios no mesmo sistema</span>
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="!rounded-button bg-primary px-6 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => handleProfessionalSignup()}
              >
                {primarySignupLabel}
              </Button>
              <Button
                variant="outline"
                className="!rounded-button border-gray-300 px-6 py-3 text-sm text-gray-700 hover:bg-white/80"
                onClick={scrollToHowItWorks}
              >
                Ver como funciona
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button
                variant="ghost"
                className="!rounded-button h-auto p-0 text-sm text-[#128C7E] hover:bg-transparent hover:text-[#0d6b60]"
                asChild
              >
                <a href={LANDING_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  Falar no WhatsApp com a equipe →
                </a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              {trialEnabled ? (
                <>
                  <span className="font-medium text-gray-700">Sem cartão no cadastro.</span> Teste por {trialDays} dias
                  com acesso completo do plano escolhido.
                </>
              ) : (
                <>
                  Cadastre a empresa primeiro. <span className="font-medium text-gray-700">Já tenho conta</span> é só
                  para quem já concluiu o cadastro.
                </>
              )}
            </p>
          </div>

          {/* Visual: celular + cards */}
          <div className="relative flex min-h-[420px] items-center justify-center pb-8 lg:min-h-[480px] lg:justify-end lg:pb-0">
            <LandingHeroVisual />
          </div>
        </div>
      </section>

      <LandingClientBookingSection />

      {/* Como começar — remove dúvida entre cadastro e login */}
      <section id="como-comecar" className="border-y border-gray-100 bg-gray-50 py-14">
        <div className="container mx-auto px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Como começar no PlanoAgenda
            </h2>
            <p className="mt-3 text-gray-600">
              {trialEnabled
                ? 'Cadastre a empresa, teste grátis sem cartão e só assine se fizer sentido para o seu negócio.'
                : 'Login não cria conta. No primeiro acesso você cadastra a empresa; só depois entra com e-mail e senha.'}
            </p>
          </div>
          <ol className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            <li className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                1
              </span>
              <h3 className="text-lg font-semibold text-gray-900">Cadastre sua empresa</h3>
              <p className="mt-2 text-sm text-gray-600">
                Crie o perfil do negócio (dados da empresa e do responsável). É o passo obrigatório do primeiro acesso.
              </p>
            </li>
            <li className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                2
              </span>
              <h3 className="text-lg font-semibold text-gray-900">
                {trialEnabled ? `Teste grátis por ${trialDays} dias` : 'Escolha e ative o plano'}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {trialEnabled
                  ? 'Selecione o plano na landing ou no cadastro. Você entra no painel com acesso completo — sem pagamento na hora.'
                  : 'Selecione o plano que combina com o tamanho da operação e conclua a adesão.'}
              </p>
            </li>
            <li className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                3
              </span>
              <h3 className="text-lg font-semibold text-gray-900">Entre com o login</h3>
              <p className="mt-2 text-sm text-gray-600">
                Depois do cadastro, use <span className="font-semibold text-gray-800">Já tenho conta</span> para acessar o painel com e-mail e senha.
              </p>
            </li>
          </ol>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              className="!rounded-button bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={() => handleProfessionalSignup()}
            >
              {trialEnabled ? primarySignupLabel : 'Ir para o cadastro da empresa'}
            </Button>
            <button
              type="button"
              className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline"
              onClick={() => setIsLoginChoiceModalOpen(true)}
            >
              Já cadastrei — quero entrar
            </button>
          </div>
        </div>
      </section>

      {/* Seção de dor: agenda vazando dinheiro */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Sem um sistema eficiente, sua agenda vaza dinheiro todos os dias
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Papel, caderninho e WhatsApp &quot;no improviso&quot; parecem funcionar… até você perceber quantos clientes{' '}
              <span className="font-semibold text-gray-900">esquecem o horário</span> e quantos atendimentos ficam vazios sem necessidade.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border border-gray-200 rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 text-lg">
                  ✖
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Clientes que simplesmente não aparecem
                </h3>
                <p className="text-sm text-gray-600">
                  Sem lembretes automáticos, muita gente esquece do compromisso. Cada falta é um horário bloqueado que{' '}
                  <span className="font-semibold text-gray-800">não volta mais</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 text-lg">
                  📅
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Agenda confusa e difícil de controlar
                </h3>
                <p className="text-sm text-gray-600">
                  Misturar agenda de papel, mensagens soltas e memória é receita para{' '}
                  <span className="font-semibold text-gray-800">erros, furos e horários duplicados</span>, principalmente quando o movimento aumenta.
                </p>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-4 text-lg">
                  💬
                </div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Você vira &quot;secretário&quot; do próprio negócio
                </h3>
                <p className="text-sm text-gray-600">
                  Ficar lembrando manualmente cada cliente no WhatsApp toma tempo e energia. No fim do dia, você está{' '}
                  <span className="font-semibold text-gray-800">exausto</span> e ainda assim alguns esquecem.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Seção de como funcionam os lembretes automáticos */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Lembretes automáticos no WhatsApp que trabalham por você
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              O PlanoAgenda envia a mensagem certa, na hora certa, para o cliente certo –{' '}
              <span className="font-semibold text-gray-900">sem você precisar tocar no celular</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border border-gray-200 rounded-2xl bg-gray-50">
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-gray-500 mb-2">Passo 1</p>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Confirmação na hora do agendamento
                </h3>
                <p className="text-sm text-gray-600">
                  Assim que o cliente agenda, ele recebe{' '}
                  <span className="font-semibold text-gray-800">uma mensagem de confirmação no WhatsApp</span> com data e horário certinhos.
                  Menos dúvidas, menos remarcações.
                </p>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 rounded-2xl bg-gray-50">
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-gray-500 mb-2">Passo 2</p>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Lembrete 1 dia antes
                </h3>
                <p className="text-sm text-gray-600">
                  Um dia antes, o sistema envia um lembrete automático. O cliente se organiza e{' '}
                  <span className="font-semibold text-gray-800">diminui muito a chance de esquecer</span>.
                </p>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 rounded-2xl bg-gray-50">
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-gray-500 mb-2">Passo 3</p>
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Lembrete poucas horas antes
                </h3>
                <p className="text-sm text-gray-600">
                  Algumas horas antes, o cliente recebe outro lembrete. Você mantém o compromisso fresco na mente dele e evita a{' '}
                  <span className="font-semibold text-gray-800">cadeira vazia</span>.
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="mt-10 text-center text-base text-gray-800 font-semibold max-w-3xl mx-auto">
            Resultado: <span className="text-primary">menos faltas, mais horários preenchidos e mais dinheiro no caixa</span>, enquanto o sistema cuida dos lembretes para você.
          </p>
        </div>
      </section>

      {/* Benefícios Principais */}
      <section id="beneficios" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Por Que Profissionais Escolhem PlanoAgenda?</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A plataforma completa que você precisa para gerenciar seu negócio
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock3 className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Agendamentos 24/7</h3>
                <p className="text-lg text-gray-600">
                  Seus clientes agendam a qualquer hora, mesmo quando você está dormindo. <strong className="text-gray-900">Aumente sua receita sem trabalhar mais horas.</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Wallet className="h-8 w-8 text-black" aria-hidden />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Controle Financeiro Completo</h3>
                <p className="text-lg text-gray-600">
                  Gerencie caixa, estoque e relatórios em um só lugar. <strong className="text-gray-900">Tenha clareza total sobre o que entra e sai do seu negócio.</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-black" aria-hidden />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Relatórios que Geram Resultados</h3>
                <p className="text-lg text-gray-600">
                  Veja exatamente quais serviços vendem mais, em que horários e dias. <strong className="text-gray-900">Decisões baseadas em dados, não em achismos.</strong>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {trialEnabled && !loadingTrialSettings && (
        <div className="container mx-auto px-6 pt-4">
          <div className="mx-auto max-w-2xl rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-900">
            <p className="font-semibold">Teste grátis de {trialDays} dias em qualquer plano de serviços</p>
            <p className="mt-1 text-green-800">Sem cartão no cadastro — você assina só se quiser continuar após o teste.</p>
          </div>
        </div>
      )}

      <LandingPlansSection
        plansWithMenus={plansWithMenus}
        loading={loadingPlans}
        trialEnabled={trialEnabled}
        trialDays={trialDays}
        onPlanSignup={handleProfessionalSignup}
        planSignupLabel={planSignupLabel}
        sectionTitle="Planos para serviços"
        sectionSubtitle="Salões, barbearias, clínicas e profissionais autônomos — escolha o plano e cadastre sua empresa."
        emptyMessage="Nenhum plano para serviços disponível no momento."
      />

      <div className="container mx-auto px-6 pb-8 text-center">
        <p className="text-gray-600">
          Tem arena ou quadras esportivas?{' '}
          <Link to={ARENA_LANDING_PATH} className="font-semibold text-primary hover:underline">
            Conheça o Plano Arena →
          </Link>
        </p>
      </div>

      <LandingSegmentsSection />

      {/* CTA final — trial */}
      {trialEnabled && !loadingTrialSettings && (
        <section className="border-y border-primary/20 bg-primary/5 py-14">
          <div className="container mx-auto px-6 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
              Sem cartão · {trialDays} dias grátis
            </p>
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Experimente o PlanoAgenda com o seu negócio real
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              Cadastre a empresa, configure WhatsApp e link de agendamento — sem compromisso financeiro no primeiro passo.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                className="!rounded-button bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => handleProfessionalSignup()}
              >
                {primarySignupLabel}
              </Button>
              <Button
                variant="outline"
                className="!rounded-button border-gray-300 px-6 py-3"
                onClick={scrollToPlans}
              >
                Comparar planos e preços
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Por Que Escolher */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Por Que Escolher PlanoAgenda?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Setup em 24h</h3>
                <p className="text-gray-600">
                  Configure sua conta e comece a receber agendamentos em menos de 1 dia
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-lock text-2xl text-black"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">100% Seguro</h3>
                <p className="text-gray-600">
                  Seus dados protegidos com criptografia de nível bancário
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-mobile-alt text-2xl text-black"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Acesse de Qualquer Lugar</h3>
                <p className="text-gray-600">
                  Funciona perfeitamente no celular, tablet ou computador
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-primary transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Suporte Dedicado</h3>
                <p className="text-gray-600">
                  Equipe pronta para ajudar você a ter sucesso
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <LandingFaqSection trialEnabled={trialEnabled} trialDays={trialDays} />

      {/* Seção de Contato (Agora com Cards) */}
      <section id="contact-section" className="py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-12">
            Vamos conversar sobre o seu negócio?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            {/* Card 1: Ligue Gratuitamente */}
            <Card className="bg-gray-800 border-gray-700 text-white">
              <CardContent className="p-6 space-y-4">
                <PhoneCall className="h-12 w-12 mx-auto text-purple-500" />
                <h3 className="text-xl font-semibold">Ligue Gratuitamente</h3>
                <a 
                  href="tel:+5546999163402" 
                  className="text-gray-400 hover:text-white transition-colors text-sm block"
                >
                  +55 46 99916-3402
                </a>
              </CardContent>
            </Card>

            {/* Card 2: Converse por WhatsApp */}
            <Card className="bg-gray-800 border-gray-700 text-white">
              <CardContent className="p-6 space-y-4">
                <MessageSquare className="h-12 w-12 mx-auto text-green-500" />
                <h3 className="text-xl font-semibold">Converse por WhatsApp</h3>
                <a 
                  href={LANDING_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors text-sm block"
                >
                  Iniciar Conversa
                </a>
              </CardContent>
            </Card>

            {/* Card 3: Nós ligamos para você */}
            <Card className="bg-gray-800 border-gray-700 text-white">
              <CardContent className="p-6 space-y-4">
                <PhoneCall className="h-12 w-12 mx-auto text-blue-500" />
                <h3 className="text-xl font-semibold">Nós ligamos para você</h3>
                <Button 
                  className="!rounded-button whitespace-nowrap text-sm px-6 py-2 bg-white text-gray-900 hover:bg-gray-200" 
                  onClick={() => setIsContactModalOpen(true)} // Abre o modal
                >
                  Solicitar Contato
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      
      {/* Rodapé com Ícones de Redes Sociais */}
      <footer className="bg-gray-900 border-t border-gray-800 py-6">
        <div className="container mx-auto px-6 flex flex-col items-center justify-center">
          <div className="flex space-x-6 mb-4">
            {/* Ícone do Instagram */}
            <div className="text-gray-500 hover:text-white transition-colors cursor-default">
              <i className="fab fa-instagram text-2xl"></i>
            </div>
            {/* Ícone do Facebook */}
            <div className="text-gray-500 hover:text-white transition-colors cursor-default">
              <i className="fab fa-facebook-f text-2xl"></i>
            </div>
            {/* Ícone do Twitter */}
            <div className="text-gray-500 hover:text-white transition-colors cursor-default">
              <i className="fab fa-twitter text-2xl"></i>
            </div>
            {/* Ícone do LinkedIn */}
            <div className="text-gray-500 hover:text-white transition-colors cursor-default">
              <i className="fab fa-linkedin-in text-2xl"></i>
            </div>
          </div>
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} PlanoAgenda. Todos os direitos reservados.</p>
        </div>
      </footer>
      
      <LandingFloatingWhatsApp />

      {/* Contact Request Modal */}
      <ContactRequestModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
      />

      <Dialog open={isLoginChoiceModalOpen} onOpenChange={setIsLoginChoiceModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Entrar na sua conta</DialogTitle>
            <DialogDescription className="text-left text-base leading-relaxed text-gray-600">
              Este acesso é para quem <strong>já cadastrou a empresa</strong> e vai entrar com e-mail e senha.
              Escolha o perfil de uso só para abrir a tela certa; os recursos do sistema dependem do plano e do
              segmento da empresa.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Ainda não tem cadastro?</p>
            <p className="mt-1 text-amber-900/90">
              Não use o login no primeiro acesso. Cadastre a empresa primeiro e só depois entre com a conta criada.
            </p>
            <Button
              className="mt-3 !rounded-button bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setIsLoginChoiceModalOpen(false);
                handleProfessionalSignup();
              }}
            >
              {primarySignupLabel}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => goToLoginPath('/login')}
              className="group flex flex-col rounded-xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clock3 className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary">
                Agenda de serviços
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Para salões, clínicas, estética e negócios que atendem por <strong>serviço e profissional</strong>: agenda
                por colaborador, serviços, clientes e lembretes no fluxo tradicional.
              </p>
              <span className="mt-4 text-sm font-medium text-primary">Entrar no login padrão →</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(ARENA_LANDING_PATH)}
              className="group flex flex-col rounded-xl border-2 border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Volleyball className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary">
                Quadras e Arena
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                Para <strong>arenas, quadras esportivas e locais de reserva por horário</strong>: entrada com visual e
                mensagens pensados para <strong>gestão de quadras</strong>, reservas e operação do módulo Arena.
              </p>
              <span className="mt-4 text-sm font-medium text-primary">Conhecer Plano Arena →</span>
            </button>
          </div>

          <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Não sabe qual escolher? Use <strong>Agenda de serviços</strong>. Os recursos disponíveis no sistema dependem do
            seu plano e da configuração da empresa, não desta escolha.
          </p>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default LandingPage;