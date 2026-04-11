import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Link, useNavigate } from 'react-router-dom'; // Adicionar Link
import { setTargetCompanyId, getTargetCompanyId } from '@/utils/storage';
import { useSession } from '@/components/SessionContextProvider';
import { useIsClient } from '@/hooks/useIsClient';
import { useIsProprietario } from '@/hooks/useIsProprietario';
import { useIsCompanyAdmin } from '@/hooks/useIsCompanyAdmin';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { CompanySelectionModal } from '@/components/CompanySelectionModal';
import { useActivePlans } from '@/hooks/useActivePlans';
import { Check, Zap, Phone, MessageSquare, PhoneCall, Menu, CalendarDays, Tag, Clock } from 'lucide-react'; // Adicionar Menu e CalendarDays
import ContactRequestModal from '@/components/ContactRequestModal'; // Importar o novo modal
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"; // Importar DropdownMenu
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"; // Importar componentes de diálogo
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { isClient, loadingClientCheck } = useIsClient();
  const { isProprietario, loadingProprietarioCheck } = useIsProprietario();
  const { isCompanyAdmin, loadingCompanyAdminCheck } = useIsCompanyAdmin();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const { plans, loading: loadingPlans } = useActivePlans();
  
  // Buscar menus vinculados aos planos
  useEffect(() => {
    const fetchPlansWithMenus = async () => {
      if (!plans || plans.length === 0) {
        console.log('[LandingPage] Nenhum plano disponível');
        setPlansWithMenus([]);
        return;
      }

      console.log('[LandingPage] Buscando menus para', plans.length, 'planos');

      try {
        const plansWithMenusData = await Promise.all(
          plans.map(async (plan) => {
            console.log(`[LandingPage] Buscando menus do plano: ${plan.name} (${plan.id})`);
            
            // Buscar menus vinculados ao plano
            const { data: menuPlansData, error: menuPlansError } = await supabase
              .from('menu_plans')
              .select('menu_id, menus(id, menu_key, label, icon, description, display_order)')
              .eq('plan_id', plan.id);

            if (menuPlansError) {
              console.error(`[LandingPage] Erro ao buscar menus do plano ${plan.name}:`, menuPlansError);
            }

            const menus = (menuPlansData || [])
              .map((mp: any) => mp.menus)
              .filter((menu: any) => menu !== null && menu !== undefined)
              .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));

            // Buscar limites do plano (colaboradores e serviços)
            const { data: planLimitsData, error: limitsError } = await supabase
              .from('plan_limits')
              .select('limit_type, limit_value')
              .eq('plan_id', plan.id)
              .in('limit_type', ['collaborators', 'services']);

            if (limitsError) {
              console.error(`[LandingPage] Erro ao buscar limites do plano ${plan.name}:`, limitsError);
            }

            const limits: { collaborators?: number; services?: number } = {};
            (planLimitsData || []).forEach((limit: any) => {
              if (limit.limit_type === 'collaborators') {
                limits.collaborators = limit.limit_value;
              } else if (limit.limit_type === 'services') {
                limits.services = limit.limit_value;
              }
            });

            return { ...plan, menus, limits };
          })
        );

        console.log('[LandingPage] Planos com menus carregados:', plansWithMenusData.map((p: any) => ({
          name: p.name,
          menusCount: p.menus?.length || 0
        })));

        setPlansWithMenus(plansWithMenusData);
      } catch (error) {
        console.error('[LandingPage] Erro ao buscar menus dos planos:', error);
        setPlansWithMenus(plans.map(p => ({ ...p, menus: [] })));
      }
    };

    if (!loadingPlans) {
      fetchPlansWithMenus();
    }
  }, [plans, loadingPlans]);
  
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false); // Novo estado para o modal de contato
  const [isConfirmLogoutDialogOpen, setIsConfirmLogoutDialogOpen] = useState(false); // Novo estado para o diálogo de confirmação de logout
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly'); // Estado para período de cobrança
  const [plansWithMenus, setPlansWithMenus] = useState<any[]>([]); // Planos com menus vinculados

  const loadingRoles = loadingProprietarioCheck || loadingCompanyAdminCheck || loadingGlobalAdminCheck || loadingClientCheck;

  // NOTA: O redirecionamento pós-login é tratado pelo Index.tsx
  // Esta página não deve fazer redirecionamentos automáticos

  // Logic to open the selection modal if the user is a client and just logged in without a target company

  const handleProfessionalSignup = () => {
    // Redireciona para a nova página de cadastro unificado
    navigate('/register-professional');
  };

  const handleCompanySelected = (companyId: string) => {
    setTargetCompanyId(companyId);
    setIsSelectionModalOpen(false);
    navigate(`/agendar/${companyId}`, { replace: true });
  };

  // Funções de scroll para navegação por âncoras
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80; // Altura do header fixo
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
  
  // Determine the most expensive plan for visual highlight (usando plansWithMenus se disponível, senão plans)
  const plansToUse = plansWithMenus.length > 0 ? plansWithMenus : plans;
  const highestPricedPlan = plansToUse.reduce((max, plan) => (plan.price > max.price ? plan : max), plansToUse[0] || { price: -1 });

  return (
    <div className="min-h-screen bg-white">
      {/* Header Customizado para Landing Page */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
              <CalendarDays className="text-white h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">TipoAgenda</h1>
          </Link>

          {/* Menu de Navegação - Desktop: Links visíveis, Mobile: Menu hamburger */}
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            <button
              onClick={() => scrollToSection('inicio')}
              className="text-sm font-medium text-gray-700 hover:text-yellow-600 transition-colors"
            >
              Início
            </button>
            <button
              onClick={() => scrollToSection('beneficios')}
              className="text-sm font-medium text-gray-700 hover:text-yellow-600 transition-colors"
            >
              Benefícios
            </button>
            <button
              onClick={() => scrollToSection('plans-section')}
              className="text-sm font-medium text-gray-700 hover:text-yellow-600 transition-colors"
            >
              Planos
            </button>
            <button
              onClick={() => scrollToSection('depoimentos')}
              className="text-sm font-medium text-gray-700 hover:text-yellow-600 transition-colors"
            >
              Depoimentos
            </button>
            <button
              onClick={() => scrollToSection('contact-section')}
              className="text-sm font-medium text-gray-700 hover:text-yellow-600 transition-colors"
            >
              Contato
            </button>
          </nav>

          {/* Menu de Login/Cadastro - Desktop: Botões visíveis, Mobile: Menu hamburger */}
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
                  <DropdownMenuItem onClick={() => {
                    supabase.auth.signOut();
                    navigate('/');
                  }}>
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // Usuário não logado: botões visíveis no desktop, menu hamburger no mobile
              <>
                {/* Desktop: Botões visíveis */}
                <div className="hidden md:flex items-center gap-3">
                  <Button
                    variant="ghost"
                    className="!rounded-button text-gray-700 hover:text-gray-900"
                    onClick={() => navigate('/login')}
                  >
                    Login
                  </Button>
                  <Button
                    className="!rounded-button bg-yellow-600 hover:bg-yellow-700 text-black font-semibold"
                    onClick={scrollToPlans}
                  >
                    Comece Agora
                  </Button>
                </div>
                {/* Mobile: Menu hamburger com navegação e login */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="!rounded-button md:hidden">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => scrollToSection('inicio')}>
                      Início
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('beneficios')}>
                      Benefícios
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('plans-section')}>
                      Planos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('depoimentos')}>
                      Depoimentos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => scrollToSection('contact-section')}>
                      Contato
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/login')}>
                      Login/Cadastro
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/register-professional')}>
                      Cadastro da Empresa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section focado em WhatsApp */}
      <section id="inicio" className="bg-white pt-20 pb-10">
        <div className="container mx-auto px-6 grid md:grid-cols-2 gap-10 items-center">
          {/* Texto principal */}
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight text-gray-900">
              Pare de perder dinheiro com clientes que não aparecem
            </h1>
            <p className="text-lg text-gray-600 mb-6">
              O TipoAgenda envia <span className="font-semibold text-gray-900">lembretes automáticos pelo WhatsApp</span> antes de cada horário marcado.
              Menos esquecimentos, <span className="font-semibold text-gray-900">mais clientes chegando na hora certa</span>, sem você mandar uma única mensagem manual.
            </p>
            <ul className="space-y-2 mb-8 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Lembretes 100% automáticos para cada agendamento</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Mensagens com nome do cliente, empresa e horário</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Integrado direto com a sua agenda online</span>
              </li>
            </ul>
            <div className="flex flex-wrap gap-3 items-center">
              <Button
                className="!rounded-button px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-black font-semibold text-base"
                onClick={scrollToPlans}
              >
                Começar Agora
              </Button>
              <Button
                variant="outline"
                className="!rounded-button px-6 py-3 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={scrollToContact}
              >
                Falar com especialista
              </Button>
            </div>
          </div>

          {/* Mock visual dos lembretes no WhatsApp */}
          <div className="relative">
            <div className="rounded-3xl border border-gray-200 shadow-xl p-4 bg-gradient-to-br from-yellow-50 to-white">
              <div className="text-sm font-semibold mb-3 text-gray-800">
                Como seus lembretes aparecem no WhatsApp:
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-white rounded-2xl shadow p-3">
                  <div className="text-xs text-gray-500 mb-1">Hoje • 10:03</div>
                  <p className="text-gray-800">
                    Olá <span className="font-semibold">[CLIENTE]</span> 👋<br />
                    Seu horário em <span className="font-semibold">[EMPRESA]</span> está confirmado para <span className="font-semibold">[DATA_HORA]</span>.
                    Qualquer dúvida, é só responder aqui.
                  </p>
                </div>
                <div className="bg-white rounded-2xl shadow p-3">
                  <div className="text-xs text-gray-500 mb-1">1 dia antes do horário</div>
                  <p className="text-gray-800">
                    Lembrete: você tem um atendimento amanhã em <span className="font-semibold">[EMPRESA]</span> às <span className="font-semibold">[DATA_HORA]</span>.
                    Te esperamos! ✨
                  </p>
                </div>
                <div className="bg-white rounded-2xl shadow p-3">
                  <div className="text-xs text-gray-500 mb-1">2 horas antes do horário</div>
                  <p className="text-gray-800">
                    Está quase na hora! ⏰<br />
                    Seu atendimento começa às <span className="font-semibold">[DATA_HORA]</span>. Qualquer imprevisto, nos avise para liberar o horário para outro cliente.
                  </p>
                </div>
              </div>
            </div>
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
                <div className="w-10 h-10 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center mb-4 text-lg">
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
              O TipoAgenda envia a mensagem certa, na hora certa, para o cliente certo –{' '}
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
            Resultado: <span className="text-yellow-600">menos faltas, mais horários preenchidos e mais dinheiro no caixa</span>, enquanto o sistema cuida dos lembretes para você.
          </p>
        </div>
      </section>

      {/* Benefícios Principais */}
      <section id="beneficios" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Por Que Profissionais Escolhem TipoAgenda?</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A plataforma completa que você precisa para gerenciar seu negócio
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CalendarDays className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Agendamentos 24/7</h3>
                <p className="text-lg text-gray-600">
                  Seus clientes agendam a qualquer hora, mesmo quando você está dormindo. <strong className="text-gray-900">Aumente sua receita sem trabalhar mais horas.</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-money-bag text-2xl text-black"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Controle Financeiro Completo</h3>
                <p className="text-lg text-gray-600">
                  Gerencie caixa, estoque e relatórios em um só lugar. <strong className="text-gray-900">Tenha clareza total sobre o que entra e sai do seu negócio.</strong>
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-chart-bar text-2xl text-black"></i>
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

      {/* Pricing Section (New) */}
      <section id="plans-section" className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Planos Para Profissionais</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-4">
              Escolha o plano ideal para gerenciar seu negócio e crescer sem limites.
            </p>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              <strong className="text-gray-900">Mais de 2.500 profissionais confiam em nós.</strong> Junte-se a eles e transforme seu negócio hoje mesmo.
            </p>
            
            {/* Toggle Mensal/Anual */}
            <div className="flex items-center justify-center mb-6">
              <ToggleGroup 
                type="single" 
                value={billingPeriod} 
                onValueChange={(value) => {
                  if (value === 'monthly' || value === 'yearly') {
                    setBillingPeriod(value);
                  }
                }}
                className="border border-gray-300 rounded-lg p-1"
              >
                <ToggleGroupItem 
                  value="monthly" 
                  aria-label="Mensal"
                  className={`px-4 py-2 rounded-md ${billingPeriod === 'monthly' ? 'bg-yellow-600 text-black' : 'bg-transparent text-gray-600'}`}
                >
                  Mensal
                </ToggleGroupItem>
                <ToggleGroupItem 
                  value="yearly" 
                  aria-label="Anual"
                  className={`px-4 py-2 rounded-md ${billingPeriod === 'yearly' ? 'bg-yellow-600 text-black' : 'bg-transparent text-gray-600'}`}
                >
                  Anual
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            
            {/* Banner de desconto anual */}
            {billingPeriod === 'yearly' && (
              <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 max-w-2xl mx-auto mb-8">
                <div className="flex items-center gap-2 justify-center">
                  <div className="bg-green-500 text-white rounded-full p-1">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-900">
                      🎉 Desconto Especial de 15% no Plano Anual!
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Economize ao pagar 12 meses de uma vez. O desconto já está aplicado nos preços abaixo.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {loadingPlans ? (
            <p className="text-center text-gray-600">Carregando planos...</p>
          ) : plansWithMenus.length === 0 ? (
            <p className="text-center text-gray-600">Nenhum plano ativo disponível no momento.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plansWithMenus.map((plan) => {
                // Verifica se este é o plano mais caro para destaque
                const isFeatured = plan.id === highestPricedPlan.id;
                const cardClasses = isFeatured 
                  ? 'border-4 border-yellow-600 shadow-2xl scale-105' 
                  : 'border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg';
                
                // Calcular preço base baseado no período selecionado
                const yearlyBasePrice = plan.price * 12;
                const basePrice = billingPeriod === 'yearly' 
                  ? Math.round(yearlyBasePrice * 0.85 * 100) / 100 // 15% de desconto no plano anual
                  : plan.price;
                
                // Calcular valor sem desconto anual para exibição
                const priceWithoutYearlyDiscount = billingPeriod === 'yearly' ? yearlyBasePrice : plan.price;
                
                // Calcular período de duração para exibição
                const displayDuration = billingPeriod === 'yearly' ? 12 : 1;
                
                // Calcular economia do desconto anual (15%)
                const yearlySavings = billingPeriod === 'yearly' 
                  ? Math.round((yearlyBasePrice - basePrice) * 100) / 100 
                  : 0;

                return (
                  <Card key={plan.id} className={cardClasses}>
                    {isFeatured && (
                      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-600 text-black text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                        <Zap className="h-3 w-3" /> MAIS POPULAR
                      </div>
                    )}
                    <CardHeader className="text-center pt-8">
                      <CardTitle className="text-3xl font-bold text-gray-900">{plan.name}</CardTitle>
                      <div className="mt-4">
                        {billingPeriod === 'yearly' && (
                          <p className="text-lg font-semibold text-gray-400 line-through mb-1">
                            R$ {priceWithoutYearlyDiscount.toFixed(2).replace('.', ',')}
                          </p>
                        )}
                        <p className="text-5xl font-extrabold text-yellow-600">
                          R$ {basePrice.toFixed(2).replace('.', ',')}
                        </p>
                        <p className="text-base text-gray-500">
                          /{displayDuration} {displayDuration > 1 ? 'meses' : 'mês'}
                          {billingPeriod === 'yearly' && yearlySavings > 0 && (
                            <span className="block text-xs text-green-600 font-semibold mt-1">
                              💰 Você economiza R$ {yearlySavings.toFixed(2).replace('.', ',')} com 15% de desconto!
                            </span>
                          )}
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-3">
                        <p className="text-center text-gray-600">{plan.description}</p>
                        
                        {/* Badge de Suporte baseado no plano */}
                        {(() => {
                          const planName = plan.name.toLowerCase();
                          if (planName.includes('platinum')) {
                            return (
                              <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                <Clock className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-medium text-blue-900">Suporte em horário comercial</span>
                              </div>
                            );
                          } else if (planName.includes('full')) {
                            return (
                              <div className="flex items-center justify-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <Zap className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-medium text-green-900">Suporte 24hrs</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      
                      {/* Exibir features do plano com limites integrados */}
                      {(() => {
                        const limits = (plan as any).limits || {};
                        let featuresToShow: string[] = [];
                        
                        // Se o plano tem features definidas, usar elas
                        if (plan.features && Array.isArray(plan.features) && plan.features.length > 0) {
                          featuresToShow = [...plan.features];
                          
                          // Integrar limites nas features (substituir placeholders ou adicionar)
                          featuresToShow = featuresToShow.map(feature => {
                            // Se a feature contém placeholder para colaboradores, substituir
                            if (feature.includes('{collaborators}') || feature.toLowerCase().includes('colaborador')) {
                              const collaboratorLimit = limits.collaborators !== undefined && limits.collaborators > 0 
                                ? limits.collaborators 
                                : null;
                              if (collaboratorLimit !== null) {
                                return `Até ${collaboratorLimit} Colaborador${collaboratorLimit > 1 ? 'es' : ''}${collaboratorLimit === 1 ? ' (Proprietário)' : ''}`;
                              }
                            }
                            // Se a feature contém placeholder para serviços, substituir
                            if (feature.includes('{services}') || feature.toLowerCase().includes('serviço')) {
                              const serviceLimit = limits.services !== undefined && limits.services > 0 
                                ? limits.services 
                                : null;
                              if (serviceLimit !== null) {
                                return `Até ${serviceLimit} Serviço${serviceLimit > 1 ? 's' : ''}`;
                              }
                            }
                            return feature;
                          });
                          
                          // Adicionar limites se não estiverem nas features
                          if (limits.collaborators !== undefined && limits.collaborators > 0) {
                            const hasCollaboratorFeature = featuresToShow.some(f => 
                              f.toLowerCase().includes('colaborador')
                            );
                            if (!hasCollaboratorFeature) {
                              // Inserir após a segunda feature (ou no início se houver menos de 2)
                              const insertIndex = featuresToShow.length >= 2 ? 2 : featuresToShow.length;
                              featuresToShow.splice(insertIndex, 0, 
                                `Até ${limits.collaborators} Colaborador${limits.collaborators > 1 ? 'es' : ''}${limits.collaborators === 1 ? ' (Proprietário)' : ''}`
                              );
                            }
                          }
                          
                          if (limits.services !== undefined && limits.services > 0) {
                            const hasServiceFeature = featuresToShow.some(f => 
                              f.toLowerCase().includes('serviço')
                            );
                            if (!hasServiceFeature) {
                              // Inserir após colaboradores ou no final
                              const collaboratorIndex = featuresToShow.findIndex(f => 
                                f.toLowerCase().includes('colaborador')
                              );
                              const insertIndex = collaboratorIndex >= 0 ? collaboratorIndex + 1 : featuresToShow.length;
                              featuresToShow.splice(insertIndex, 0, 
                                `Até ${limits.services} Serviço${limits.services > 1 ? 's' : ''}`
                              );
                            }
                          }
                        } else if (plan.menus && plan.menus.length > 0) {
                          // Fallback para menus se não houver features
                          featuresToShow = plan.menus.map((menu: any) => menu.label || menu.menu_key);
                        }
                        
                        if (featuresToShow.length > 0) {
                          return (
                            <ul className="space-y-2 text-sm text-gray-700">
                              {featuresToShow.map((feature, index) => (
                                <li key={index} className="flex items-center gap-2">
                                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          );
                        }
                        
                        return (
                          <p className="text-sm text-gray-500 text-center">
                            Nenhum módulo configurado para este plano.
                          </p>
                        );
                      })()}
                      
                      <Button
                        className="!rounded-button whitespace-nowrap w-full font-semibold py-2.5 text-base bg-yellow-600 hover:bg-yellow-700 text-black"
                        onClick={handleProfessionalSignup} // Redireciona para o cadastro unificado
                      >
                        Começar Agora
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">O Que Nossos Clientes Dizem</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Histórias reais de profissionais que transformaram seus negócios
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
            <Card className="border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <img 
                    src="https://randomuser.me/api/portraits/women/44.jpg" 
                    alt="Maria Silva" 
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-gray-200"
                  />
                  <div>
                    <h3 className="font-bold text-gray-900">Maria Silva</h3>
                    <p className="text-sm text-gray-600">Salão de Beleza</p>
                  </div>
                </div>
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-600">★</span>
                  ))}
                </div>
                <p className="text-gray-700 mb-4">
                  "Em 3 meses, aumentei meus agendamentos em 45%. O sistema de lembretes automáticos reduziu faltas em 80%. Não consigo mais imaginar meu negócio sem o TipoAgenda!"
                </p>
                <p className="text-sm font-bold text-yellow-600">
                  Resultado: +45% de agendamentos em 3 meses
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <img 
                    src="https://i.pravatar.cc/150?img=12" 
                    alt="João Santos" 
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-gray-200"
                  />
                  <div>
                    <h3 className="font-bold text-gray-900">João Santos</h3>
                    <p className="text-sm text-gray-600">Personal Trainer</p>
                  </div>
                </div>
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-600">★</span>
                  ))}
                </div>
                <p className="text-gray-700 mb-4">
                  "O controle financeiro mudou tudo! Agora sei exatamente quanto ganho por cliente, quais horários são mais rentáveis e consigo planejar melhor meu mês. Recomendo para qualquer profissional!"
                </p>
                <p className="text-sm font-bold text-yellow-600">
                  Resultado: Controle total das finanças
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <img 
                    src="https://i.pravatar.cc/150?img=47" 
                    alt="Ana Costa" 
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-gray-200"
                  />
                  <div>
                    <h3 className="font-bold text-gray-900">Ana Costa</h3>
                    <p className="text-sm text-gray-600">Clínica de Estética</p>
                  </div>
                </div>
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-600">★</span>
                  ))}
                </div>
                <p className="text-gray-700 mb-4">
                  "O sistema de fidelidade e WhatsApp automático são incríveis! Meus clientes adoram receber lembretes e ganhar pontos. A retenção de clientes aumentou muito desde que comecei a usar."
                </p>
                <p className="text-sm font-bold text-yellow-600">
                  Resultado: +60% de retenção de clientes
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <img 
                    src="https://randomuser.me/api/portraits/men/32.jpg" 
                    alt="Carlos Mendes" 
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-gray-200"
                  />
                  <div>
                    <h3 className="font-bold text-gray-900">Carlos Mendes</h3>
                    <p className="text-sm text-gray-600">Barbearia</p>
                  </div>
                </div>
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-600">★</span>
                  ))}
                </div>
                <p className="text-gray-700 mb-4">
                  "Antes eu perdia muito tempo ligando para confirmar horários. Agora o sistema envia os lembretes automaticamente pelo WhatsApp e meus clientes sempre aparecem no horário certo. Minha agenda está sempre cheia!"
                </p>
                <p className="text-sm font-bold text-yellow-600">
                  Resultado: Agenda sempre cheia e sem faltas
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Por Que Escolher */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Por Que Escolher TipoAgenda?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Setup em 24h</h3>
                <p className="text-gray-600">
                  Configure sua conta e comece a receber agendamentos em menos de 1 dia
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-lock text-2xl text-black"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">100% Seguro</h3>
                <p className="text-gray-600">
                  Seus dados protegidos com criptografia de nível bancário
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-mobile-alt text-2xl text-black"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Acesse de Qualquer Lugar</h3>
                <p className="text-gray-600">
                  Funciona perfeitamente no celular, tablet ou computador
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-2 border-gray-200 hover:border-yellow-600 transition-all shadow-lg">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
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
                  href="https://wa.me/5546999163402" 
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
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} TipoAgenda. Todos os direitos reservados.</p>
        </div>
      </footer>
      
      {/* Contact Request Modal */}
      <ContactRequestModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
      />

    </div>
  );
};

export default LandingPage;