import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Menu, MessageCircle, PhoneCall, Phone } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import planoArenaLogo from '@/assets/brand/plano-arena-logo.png';
import LandingHeroArenaVisual from '@/components/landing/LandingHeroArenaVisual';
import ArenaPainSection from '@/components/landing/ArenaPainSection';
import ArenaAthleteBookingSection from '@/components/landing/ArenaAthleteBookingSection';
import ArenaTestimonialsSection from '@/components/landing/ArenaTestimonialsSection';
import ArenaTrustSection from '@/components/landing/ArenaTrustSection';
import LandingPlansSection from '@/components/landing/LandingPlansSection';
import LandingFaqSection from '@/components/landing/LandingFaqSection';
import ContactRequestModal from '@/components/ContactRequestModal';
import { useLandingPlansWithMenus } from '@/hooks/useLandingPlansWithMenus';
import { useTrialSettings } from '@/hooks/useTrialSettings';
import {
  ARENA_BRAND,
  ARENA_BENEFITS,
  ARENA_HERO_BULLETS,
  ARENA_HOW_IT_WORKS,
  ARENA_LANDING_WHATSAPP_URL,
  buildArenaLandingFaq,
} from '@/data/arenaLandingPageContent';
import {
  ARENA_LANDING_PATH,
  ARENA_LOGIN_PATH,
  ARENA_REGISTER_PROFESSIONAL_URL,
  persistArenaRegistrationIntent,
} from '@/utils/arenaRegistration';

const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (!element) return;
  const headerOffset = 128;
  const offsetPosition = element.getBoundingClientRect().top + window.pageYOffset - headerOffset;
  window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
};

const ArenaLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { plansWithMenus, loading: loadingPlans } = useLandingPlansWithMenus('court');
  const { trial_enabled: trialEnabled, trial_days_default: trialDays, loading: loadingTrialSettings } =
    useTrialSettings();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  const primarySignupLabel = trialEnabled
    ? `Começar teste grátis de ${trialDays} dias`
    : 'Cadastrar minha arena';
  const planSignupLabel = trialEnabled ? `Teste grátis ${trialDays} dias` : 'Cadastrar arena neste plano';

  const faqItems = useMemo(
    () => buildArenaLandingFaq(trialDays, trialEnabled),
    [trialDays, trialEnabled],
  );

  const handleArenaSignup = (planId?: string) => {
    persistArenaRegistrationIntent();
    const defaultPlanId = plansWithMenus[0]?.id;
    const selectedPlanId = planId ?? defaultPlanId;
    const params = new URLSearchParams({ modo: 'arena' });
    if (selectedPlanId) params.set('plan', selectedPlanId);
    if (trialEnabled) params.set('trial', '1');
    navigate(`${ARENA_REGISTER_PROFESSIONAL_URL.split('?')[0]}?${params.toString()}`);
  };

  const lowestPrice = plansWithMenus[0]?.price;

  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0c2340]/95 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to={ARENA_LANDING_PATH} className="flex items-center gap-3" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src={planoArenaLogo} alt="Plano Arena" className="h-12 w-auto max-w-[180px] object-contain sm:h-14 sm:max-w-[220px]" />
          </Link>

          <nav className="hidden items-center gap-5 md:flex">
            {[
              ['inicio', 'Início'],
              ['como-funciona', 'Como funciona'],
              ['como-atleta-reserva', 'Reserva online'],
              ['beneficios', 'Benefícios'],
              ['plans-section', 'Planos'],
              ['depoimentos', 'Depoimentos'],
              ['faq-section', 'FAQ'],
              ['contact-section', 'Contato'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className="text-sm font-medium text-white/85 transition hover:text-white"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              className="!rounded-button hidden text-sm text-white/90 hover:bg-white/10 hover:text-white sm:inline-flex"
              onClick={() => navigate(ARENA_LOGIN_PATH)}
            >
              Já tenho conta
            </Button>
            <Button
              className="!rounded-button hidden font-semibold text-white sm:inline-flex"
              style={{ background: `linear-gradient(90deg, ${ARENA_BRAND.blue}, ${ARENA_BRAND.teal})` }}
              onClick={() => handleArenaSignup()}
            >
              {primarySignupLabel}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="!rounded-button text-white hover:bg-white/10 md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {[
                  ['inicio', 'Início'],
                  ['como-funciona', 'Como funciona'],
                  ['como-atleta-reserva', 'Reserva online'],
                  ['beneficios', 'Benefícios'],
                  ['plans-section', 'Planos'],
                  ['depoimentos', 'Depoimentos'],
                  ['faq-section', 'FAQ'],
                  ['contact-section', 'Contato'],
                ].map(([id, label]) => (
                  <DropdownMenuItem key={id} onClick={() => scrollToSection(id)}>
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="font-semibold" onClick={() => handleArenaSignup()}>
                  {primarySignupLabel}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(ARENA_LOGIN_PATH)}>Já tenho conta</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <section
        id="inicio"
        className="relative overflow-hidden pt-24 pb-16 text-white sm:pt-28 lg:pb-20"
        style={{ background: `linear-gradient(145deg, ${ARENA_BRAND.navy} 0%, #0d9488 55%, ${ARENA_BRAND.teal} 100%)` }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="container relative mx-auto grid items-center gap-10 px-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                Plano Arena · Gestão de quadras
              </span>
              {trialEnabled && !loadingTrialSettings && (
                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1 text-xs font-semibold">
                  Sem cartão · {trialDays} dias grátis
                </span>
              )}
            </div>
            <h1 className="mb-4 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl lg:text-[3.2rem]">
              Sua arena cheia, agenda organizada e reservas no automático
            </h1>
            <p className="mb-6 text-lg leading-relaxed text-white/90">
              O <strong>Plano Arena</strong> foi feito para donos de quadras — beach tennis, padel, vôlei e esportes de
              quadra. Reserva online, agenda visual e financeiro no mesmo painel.
            </p>
            <ul className="mb-8 space-y-2.5 text-sm text-white/90">
              {ARENA_HERO_BULLETS.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="!rounded-button border-0 px-7 font-bold text-[#0c2340] shadow-lg"
                style={{ background: 'linear-gradient(90deg, #ffffff, #ecfdf5)' }}
                onClick={() => handleArenaSignup()}
              >
                {primarySignupLabel}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="!rounded-button border-white/40 bg-transparent px-6 text-white hover:bg-white/10"
                onClick={() => scrollToSection('plans-section')}
              >
                Ver planos{lowestPrice ? ` — a partir de R$ ${lowestPrice.toFixed(2).replace('.', ',')}` : ''}
              </Button>
            </div>
            <p className="mt-5 text-sm text-white/75">
              Já cadastrou?{' '}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => navigate(ARENA_LOGIN_PATH)}>
                Entrar no login Arena
              </button>
            </p>
          </div>
          <div className="flex min-h-[420px] items-center justify-center pb-8 lg:min-h-[480px] lg:justify-end lg:pb-0">
            <LandingHeroArenaVisual />
          </div>
        </div>
      </section>

      <ArenaPainSection />

      <section id="como-funciona" className="border-y border-gray-100 bg-white py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Como funciona o Plano Arena</h2>
            <p className="mt-3 text-gray-600">Do cadastro à primeira reserva online em poucos passos.</p>
          </div>
          <ol className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {ARENA_HOW_IT_WORKS.map((step) => (
              <li key={step.step} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <span
                  className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${ARENA_BRAND.blue}, ${ARENA_BRAND.teal})` }}
                >
                  {step.step}
                </span>
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ArenaAthleteBookingSection />

      <section id="beneficios" className="bg-gray-50 py-20">
        <div className="container mx-auto px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Tudo que donos de arena precisam</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-600">
              Não é agenda genérica adaptada — é sistema nativo para locação de quadras esportivas.
            </p>
          </div>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ARENA_BENEFITS.map((item) => (
              <Card key={item.title} className="border-2 border-gray-100 shadow-sm transition hover:border-teal-200 hover:shadow-md">
                <CardContent className="p-6">
                  <div className="mb-3 text-3xl">{item.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <LandingPlansSection
        plansWithMenus={plansWithMenus}
        loading={loadingPlans}
        trialEnabled={trialEnabled}
        trialDays={trialDays}
        onPlanSignup={handleArenaSignup}
        planSignupLabel={planSignupLabel}
        sectionTitle="Planos Plano Arena"
        sectionSubtitle={
          trialEnabled
            ? `Teste grátis por ${trialDays} dias, sem cartão. Planos exclusivos para gestão de quadras e arenas.`
            : 'Planos exclusivos para gestão de quadras e arenas esportivas.'
        }
        emptyMessage="Nenhum plano de arena disponível no momento. Fale conosco pelo WhatsApp."
        accentClassName="text-[#0066ff]"
        featuredBadgeLabel="RECOMENDADO"
      />

      <ArenaTestimonialsSection />

      <ArenaTrustSection />

      {trialEnabled && !loadingTrialSettings && (
        <section
          className="py-14 text-white"
          style={{ background: `linear-gradient(90deg, ${ARENA_BRAND.blue}, ${ARENA_BRAND.tealDark})` }}
        >
          <div className="container mx-auto px-6 text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/85">
              Sem cartão · {trialDays} dias grátis
            </p>
            <h2 className="text-3xl font-bold md:text-4xl">Teste o Plano Arena com sua operação real</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">
              Cadastre quadras, configure horários e compartilhe o link de reserva — sem pagamento no primeiro passo.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                className="!rounded-button border-0 bg-white px-8 font-bold text-[#0c2340] hover:bg-white/90"
                onClick={() => handleArenaSignup()}
              >
                {primarySignupLabel}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="!rounded-button border-white/50 bg-transparent px-6 text-white hover:bg-white/10"
                onClick={() => scrollToSection('plans-section')}
              >
                Comparar planos Arena
              </Button>
            </div>
          </div>
        </section>
      )}

      <LandingFaqSection trialEnabled={trialEnabled} trialDays={trialDays} faqItems={faqItems} />

      <section id="contact-section" className="bg-[#0c2340] py-20 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="mb-10 text-4xl font-bold">Vamos conversar sobre sua arena?</h2>
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="border-gray-700 bg-gray-800 text-white">
              <CardContent className="space-y-4 p-6">
                <PhoneCall className="mx-auto h-12 w-12 text-teal-400" />
                <h3 className="text-xl font-semibold">Ligue ou WhatsApp</h3>
                <a href="tel:+5546999163402" className="block text-sm text-gray-300 hover:text-white">
                  +55 46 99916-3402
                </a>
                <Button asChild className="!rounded-button w-full bg-[#25D366] hover:bg-[#20bd5a]">
                  <a href={ARENA_LANDING_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Chamar no WhatsApp
                  </a>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-gray-700 bg-gray-800 text-white">
              <CardContent className="space-y-4 p-6">
                <Phone className="mx-auto h-12 w-12 text-teal-400" />
                <h3 className="text-xl font-semibold">Solicitar contato</h3>
                <p className="text-sm text-gray-300">Deixe seus dados e nossa equipe retorna com orientação sobre o Plano Arena.</p>
                <Button className="!rounded-button w-full" variant="secondary" onClick={() => setIsContactModalOpen(true)}>
                  Quero ser contactado
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="mt-10 text-sm text-gray-400">
            Agenda de serviços (salão, clínica, estética)?{' '}
            <Link to="/" className="font-medium text-teal-300 hover:text-teal-200">
              Ver landing PlanoAgenda →
            </Link>
          </p>
        </div>
      </section>

      <footer className="border-t border-gray-800 bg-[#071526] py-8 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} PlanoAgenda · Plano Arena. Todos os direitos reservados.
      </footer>

      <a
        href={ARENA_LANDING_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Conversar pelo WhatsApp"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#20bd5a]"
      >
        <MessageCircle className="h-7 w-7" />
      </a>

      <ContactRequestModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
    </div>
  );
};

export default ArenaLandingPage;
