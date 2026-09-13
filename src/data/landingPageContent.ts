export const LANDING_WHATSAPP_URL = 'https://wa.me/5546999163402?text=Ol%C3%A1!%20Vim%20pelo%20site%20PlanoAgenda%20e%20quero%20saber%20mais.';

export const LANDING_CLIENT_BOOKING_STEPS = [
  {
    step: '1',
    title: 'Acessa seu link de agendamento',
    description:
      'Você compartilha um link com a marca da sua empresa. O cliente agenda quando quiser, sem precisar te chamar no WhatsApp.',
  },
  {
    step: '2',
    title: 'Escolhe serviço, profissional e horário',
    description:
      'Em poucos cliques, o cliente vê disponibilidade real da agenda e confirma o horário que funciona para ele.',
  },
  {
    step: '3',
    title: 'Recebe confirmação e lembretes no WhatsApp',
    description:
      'O PlanoAgenda envia confirmação e lembretes automáticos antes do atendimento — menos faltas, menos trabalho manual.',
  },
] as const;

export const LANDING_SEGMENTS = [
  {
    initials: 'BB',
    segment: 'Barbearia',
    quote:
      'Agenda online + lembrete no WhatsApp reduz faltas e libera tempo que antes ia para confirmar horário manualmente.',
    highlight: 'Menos faltas na cadeira',
  },
  {
    initials: 'ES',
    segment: 'Estética e salão',
    quote:
      'Clientes agendam sozinhas e recebem lembretes automáticos. A equipe foca no atendimento, não no celular o dia inteiro.',
    highlight: 'Agenda organizada para equipe',
  },
  {
    initials: 'PT',
    segment: 'Personal e consultoria',
    quote:
      'Controle financeiro e agenda no mesmo lugar. Fica claro o que entrou, o que saiu e quais horários rendem mais.',
    highlight: 'Gestão simples para autônomos',
  },
  {
    initials: 'AR',
    segment: 'Arenas e quadras',
    quote:
      'Reserva de quadras, horários e pagamentos integrados — módulo pensado para quem não encontra isso em apps genéricos de agenda.',
    highlight: 'Diferencial PlanoAgenda',
  },
] as const;

export type LandingFaqItem = {
  question: string;
  answer: string;
};

/** Monta FAQ com copy de trial dinâmica conforme configuração em produção. */
export function buildLandingFaq(trialDays: number, trialEnabled: boolean): LandingFaqItem[] {
  const trialPaymentAnswer = trialEnabled
    ? `Não. Você começa com ${trialDays} dias de teste grátis, sem cartão no cadastro. Use o sistema completo do plano escolhido e assine só quando quiser continuar.`
    : 'Sim. Após o cadastro da empresa, você escolhe o plano e conclui a assinatura para ativar o acesso.';

  return [
    {
      question: 'Meu cliente consegue agendar sozinho?',
      answer:
        'Sim. Cada empresa recebe um link de agendamento personalizado. O cliente escolhe serviço, profissional (quando aplicável), data e horário disponíveis.',
    },
    {
      question: 'Os lembretes pelo WhatsApp são automáticos?',
      answer:
        'Sim. Após configurar templates e regras, o sistema envia confirmação e lembretes antes do horário — sem você precisar mandar mensagem manual para cada cliente.',
    },
    {
      question: 'Funciona no celular e no computador?',
      answer:
        'Sim. O painel é responsivo e funciona bem no navegador do celular, tablet ou desktop.',
    },
    {
      question: 'Serve para equipe com vários colaboradores?',
      answer:
        'Sim. Os planos permitem múltiplos colaboradores conforme o limite do plano contratado. No Plano Full, colaboradores são ilimitados.',
    },
    {
      question: 'Tem módulo para arenas e quadras?',
      answer:
        'Sim. O PlanoAgenda possui módulo Arena com reserva de quadras, horários e fluxos específicos para esse segmento.',
    },
    {
      question: 'Preciso pagar na hora do cadastro?',
      answer: trialPaymentAnswer,
    },
    ...(trialEnabled
      ? [
          {
            question: 'O que acontece quando o teste grátis termina?',
            answer: `Após os ${trialDays} dias, você pode assinar o plano escolhido para manter o acesso completo. Seus dados permanecem salvos — basta concluir o pagamento em Planos.`,
          },
        ]
      : []),
    {
      question: 'Posso falar com alguém antes de contratar?',
      answer:
        'Sim. Use o WhatsApp no site ou a seção de contato. Nossa equipe ajuda a entender qual plano combina com o tamanho do seu negócio.',
    },
  ];
}

export const LANDING_DIFFERENTIATORS = [
  {
    title: 'WhatsApp automático',
    description: 'Confirmação e lembretes configuráveis por tipo de mensagem.',
  },
  {
    title: 'Agenda online 24h',
    description: 'Seus clientes marcam horário a qualquer hora, sem depender de você online.',
  },
  {
    title: 'Caixa e relatórios',
    description: 'Visão financeira e operacional no mesmo sistema — além de só marcar horário.',
  },
  {
    title: 'Módulo Arena',
    description: 'Quadras, reservas e fluxos específicos para esportes e locação de espaços.',
  },
] as const;
