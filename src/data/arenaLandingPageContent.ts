import type { LandingFaqItem } from '@/data/landingPageContent';

export const ARENA_LANDING_WHATSAPP_URL =
  'https://wa.me/5546999163402?text=Ol%C3%A1!%20Vim%20pela%20landing%20Plano%20Arena%20e%20quero%20saber%20mais%20sobre%20gest%C3%A3o%20de%20quadras.';

export const ARENA_BRAND = {
  navy: '#0c2340',
  blue: '#0066ff',
  teal: '#10b981',
  tealDark: '#059669',
} as const;

export const ARENA_HERO_BULLETS = [
  'Reserva online 24h — atleta agenda sozinho pelo link da arena',
  'Agenda visual por quadra, horário e esporte',
  'Mensalistas, pacotes, torneios e controle financeiro integrado',
] as const;

export const ARENA_HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Cadastre sua arena',
    description:
      'Configure quadras, esportes, horários de funcionamento e preços por faixa — tudo pensado para locação por horário.',
  },
  {
    step: '2',
    title: 'Compartilhe o link de reserva',
    description:
      'Atletas escolhem quadra, data e horário disponíveis. Menos ligação, menos WhatsApp manual, mais quadras ocupadas.',
  },
  {
    step: '3',
    title: 'Gerencie tudo no painel Arena',
    description:
      'Agenda, reservas, mensalistas, caixa e relatórios no mesmo sistema — com visual e fluxos feitos para donos de arena.',
  },
] as const;

export const ARENA_BENEFITS = [
  {
    icon: '🏐',
    title: 'Agenda por quadra e horário',
    description:
      'Visualize ocupação em tempo real. Beach tennis, padel, vôlei ou futebol — cada quadra com sua regra.',
  },
  {
    icon: '💰',
    title: 'Preços por faixa horária',
    description:
      'Configure valores diferentes para pico, feriado ou horário promocional sem planilha.',
  },
  {
    icon: '📱',
    title: 'Reserva online 24h',
    description:
      'Seu cliente reserva quando quiser. Você para de perder tempo confirmando horário no WhatsApp.',
  },
  {
    icon: '🏆',
    title: 'Torneios e mensalistas',
    description:
      'Pacotes mensais, reservas em lote e módulo de torneios para arenas que querem ir além da locação avulsa.',
  },
  {
    icon: '📊',
    title: 'Financeiro integrado',
    description:
      'Caixa, comissões e relatórios no mesmo painel — saiba quanto cada quadra está faturando.',
  },
  {
    icon: '⚡',
    title: 'Feito para arena, não adaptado',
    description:
      'Diferente de apps genéricos de agenda de serviço: fluxo nativo de quadras, slots e reservas esportivas.',
  },
] as const;

export const ARENA_ATHLETE_BOOKING_STEPS = [
  {
    step: '1',
    title: 'Acessa o link da sua arena',
    description:
      'Você compartilha um link personalizado. O atleta reserva quando quiser — sem precisar mandar mensagem no WhatsApp.',
  },
  {
    step: '2',
    title: 'Escolhe quadra, esporte e horário',
    description:
      'Em poucos cliques, vê a disponibilidade real de cada quadra e confirma o horário que funciona para ele.',
  },
  {
    step: '3',
    title: 'Reserva confirmada na hora',
    description:
      'A agenda atualiza automaticamente. Você acompanha tudo no painel — sem planilha, sem caderninho.',
  },
] as const;

export const ARENA_PAIN_POINTS = [
  {
    title: 'Horários perdidos no WhatsApp',
    description:
      'Mensagens se perdem, horários ficam duplicados e quadras ficam vazias sem você perceber.',
  },
  {
    title: 'Agenda no papel ou planilha',
    description:
      'Difícil enxergar ocupação por quadra. Erros de horário viram conflito com o cliente na hora do jogo.',
  },
  {
    title: 'Preço diferente por faixa — caos na cobrança',
    description:
      'Pico, feriado, promocional… sem sistema, alguém sempre cobra errado ou esquece de registrar.',
  },
] as const;

export const ARENA_STATS = [
  { value: '24h', label: 'Reserva online a qualquer hora' },
  { value: '100%', label: 'Agenda visual por quadra' },
  { value: '1 painel', label: 'Reservas, caixa e relatórios juntos' },
] as const;

export const ARENA_TRUST_ITEMS = [
  {
    title: 'Setup rápido',
    description: 'Configure quadras e horários em poucas horas — nossa equipe ajuda no primeiro passo.',
  },
  {
    title: 'Suporte humano',
    description: 'Fale com quem entende de arena, não só de software genérico.',
  },
  {
    title: 'Cresce com você',
    description: 'De uma quadra a várias unidades — mensalistas, torneios e pacotes no mesmo lugar.',
  },
  {
    title: 'Seguro e na nuvem',
    description: 'Seus dados protegidos. Acesse de celular, tablet ou computador.',
  },
] as const;

export type ArenaTestimonial = {
  initials: string;
  name: string;
  role: string;
  city: string;
  segment: string;
  quote: string;
  highlight: string;
  rating: number;
};

export const ARENA_TESTIMONIALS: ArenaTestimonial[] = [
  {
    initials: 'RC',
    name: 'Ricardo Campos',
    role: 'Proprietário',
    city: 'Cascavel, PR',
    segment: 'Arena Beach Tennis',
    quote:
      'Antes perdíamos horários no WhatsApp. Hoje o atleta reserva sozinho e a agenda das quatro quadras fica organizada o dia inteiro. Ocupação subiu visivelmente.',
    highlight: 'Menos buracos na agenda',
    rating: 5,
  },
  {
    initials: 'MF',
    name: 'Mariana Ferreira',
    role: 'Gestora',
    city: 'Toledo, PR',
    segment: 'Centro de Padel',
    quote:
      'Conseguimos precificar horário de pico e promocional sem confusão. O caixa fechou redondo no fim do mês — antes era planilha e dor de cabeça.',
    highlight: 'Controle financeiro claro',
    rating: 5,
  },
  {
    initials: 'JL',
    name: 'João Lima',
    role: 'Sócio',
    city: 'Foz do Iguaçu, PR',
    segment: 'Arena de Vôlei de Praia',
    quote:
      'Mensalistas e reservas avulsas no mesmo lugar. O time não precisa mais ficar olhando planilha no domingo. Recomendo para qualquer dono de quadra.',
    highlight: 'Operação mais leve',
    rating: 5,
  },
  {
    initials: 'AS',
    name: 'Ana Souza',
    role: 'Administradora',
    city: 'Medianeira, PR',
    segment: 'Complexo esportivo',
    quote:
      'O link de reserva mudou o jogo. Cliente marca de madrugada, eu acordo com a agenda cheia. Torneios e pacotes mensais ficaram muito mais fáceis de gerir.',
    highlight: 'Reserva 24h funcionando',
    rating: 5,
  },
  {
    initials: 'PT',
    name: 'Paulo Teixeira',
    role: 'Proprietário',
    city: 'Pato Branco, PR',
    segment: 'Quadras multi-esporte',
    quote:
      'Testamos apps genéricos de agenda e não serviam. O Plano Arena entende locação por horário, quadra e esporte — é outro nível para quem vive disso.',
    highlight: 'Feito para arena de verdade',
    rating: 5,
  },
  {
    initials: 'LC',
    name: 'Lucas Costa',
    role: 'Gerente',
    city: 'Francisco Beltrão, PR',
    segment: 'Beach Tennis & Padel',
    quote:
      'Relatório de faturamento por quadra me mostrou qual horário rende mais. Ajustamos preço de pico e aumentamos receita sem abrir mais quadra.',
    highlight: 'Decisão com dados',
    rating: 5,
  },
];

export function buildArenaLandingFaq(trialDays: number, trialEnabled: boolean): LandingFaqItem[] {
  const trialPaymentAnswer = trialEnabled
    ? `Não. Você começa com ${trialDays} dias de teste grátis, sem cartão no cadastro. Use o módulo Arena completo e assine só quando quiser continuar.`
    : 'Sim. Após o cadastro da arena, você escolhe o plano Arena e conclui a assinatura para ativar o acesso.';

  return [
    {
      question: 'O Plano Arena é diferente da agenda de serviços?',
      answer:
        'Sim. O Plano Arena é pensado para locação de quadras por horário — com agenda por quadra, reservas esportivas, mensalistas e torneios. A agenda de serviços é para salões, clínicas e negócios que atendem por profissional.',
    },
    {
      question: 'Quantas quadras posso cadastrar?',
      answer:
        'Depende do plano Arena contratado. Todos incluem o módulo completo de quadras, reservas e agenda visual.',
    },
    {
      question: 'O atleta consegue reservar sozinho?',
      answer:
        'Sim. Cada arena recebe um link de agendamento. O atleta escolhe quadra, esporte, data e horário disponíveis.',
    },
    {
      question: 'Funciona para beach tennis, padel e vôlei?',
      answer:
        'Sim. Você configura os esportes de cada quadra e define horários, preços e regras específicas.',
    },
    {
      question: 'Preciso pagar na hora do cadastro?',
      answer: trialPaymentAnswer,
    },
    ...(trialEnabled
      ? [
          {
            question: 'O que acontece quando o teste grátis termina?',
            answer: `Após os ${trialDays} dias, assine o plano Arena para manter o acesso. Seus dados de quadras e reservas permanecem salvos.`,
          },
        ]
      : []),
    {
      question: 'Já tenho conta — onde entro?',
      answer:
        'Use o botão "Já tenho conta" nesta página para ir ao login Arena em planoagenda.com.br/arenalogin.',
    },
    {
      question: 'Posso falar com alguém antes de contratar?',
      answer:
        'Sim. Clique no WhatsApp flutuante ou na seção de contato. Nossa equipe ajuda a entender se o Plano Arena combina com sua operação.',
    },
  ];
}
