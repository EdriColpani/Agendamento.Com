import type { HelpCategory } from './helpTypes';

/**
 * Central de Ajuda exclusiva para empresas em modo Arena (segmento com scheduling_mode = court).
 * Não misturar com helpCategories (modo serviço).
 */
export const helpCategoriesArena: HelpCategory[] = [
  {
    id: 'arena-visao-geral',
    name: 'Modo Arena / Quadras',
    icon: 'fas fa-border-all',
    description: 'Como funciona o PlanoAgenda para gestão de quadras e reservas',
    topics: [
      {
        id: 'arena-o-que-e',
        title: 'O que é o modo Arena',
        description:
          'Empresas de segmento “quadras” usam agenda por quadra, reserva pública e fluxos pensados para esportes.',
        steps: [
          'O modo é definido pelo tipo de segmento da empresa (agenda por quadra, não por serviço de salão)',
          'O menu traz atalhos para Quadras, Agenda, Reservas, Horários e Preços',
          'O dashboard pode exibir o painel “Arena / quadras” com atalhos e indicadores',
          'Alguns recursos dependem do plano (ex.: módulo de quadras ativo na assinatura)',
        ],
        tips: [
          'Se algo não aparecer, confira em Configurações / plano se o módulo de quadras está habilitado',
          'Colaboradores veem apenas os menus liberados pelo plano e permissões',
        ],
        tags: ['arena', 'quadras', 'modo', 'segmento'],
      },
      {
        id: 'arena-vs-servico',
        title: 'Diferença em relação ao modo serviço',
        description:
          'Na arena o foco é quadra, horário e duração; agendamentos podem ser vinculados a quadras e à reserva pública.',
        steps: [
          'Serviços de salão: foco em colaborador + serviço; arena: quadra + horário',
          'Existe fluxo de reserva pública (link para o cliente reservar sem login, conforme configuração)',
          'Relatórios e clientes podem continuar disponíveis; a navegação principal prioriza quadras',
        ],
        tips: ['Use a Lista de reservas para ver todas as reservas de quadra no período'],
        tags: ['arena', 'serviço', 'diferença'],
      },
    ],
  },
  {
    id: 'arena-dashboard',
    name: 'Dashboard Arena',
    icon: 'fas fa-chart-line',
    description: 'Painel inicial com indicadores e atalhos do módulo quadras',
    topics: [
      {
        id: 'arena-dashboard-painel',
        title: 'Painel Arena / quadras',
        description:
          'Resumo de faturamento, reservas do dia e atalhos para quadras, reserva pública, lista e novas reservas.',
        steps: [
          'Abra o Dashboard pelo menu lateral',
          'Leia o aviso sobre o modo arena e o link público de reserva',
          'Use os botões: Gerenciar quadras, Abrir reserva pública, Lista de reservas, Nova reserva, Novo cliente',
          'Acompanhe os cards de faturamento, reservas de hoje e estoque crítico (se houver permissão)',
        ],
        tips: [
          '“Abrir reserva pública” abre o link que seus clientes usam para reservar',
          '“Lista de reservas” mostra o relatório filtrável por período e quadra',
        ],
        tags: ['dashboard', 'arena', 'atalhos', 'kpi'],
      },
    ],
  },
  {
    id: 'arena-quadras',
    name: 'Quadras',
    icon: 'fas fa-volleyball-ball',
    description: 'Cadastro e gestão das quadras',
    topics: [
      {
        id: 'arena-quadras-lista',
        title: 'Gerenciar quadras',
        description: 'Cadastre quadras, ordem de exibição, dados e imagem para o sistema e para a reserva pública.',
        steps: [
          'Acesse o menu Quadras (ou “Gerenciar quadras” no dashboard)',
          'Inclua nome, identificação e informações úteis para o cliente',
          'Defina ordem de exibição quando houver várias quadras',
          'Salve e verifique se a quadra aparece na agenda e na reserva pública',
        ],
        tips: [
          'Imagens e descrições ajudam na página pública de reserva',
          'Campos de localização podem ser usados conforme a configuração da empresa',
        ],
        tags: ['quadras', 'cadastro', 'lista', 'gestão'],
      },
      {
        id: 'arena-quadras-reserva-publica',
        title: 'Quadra e reserva pública',
        description: 'As quadras cadastradas alimentam a grade e o link de reserva para clientes.',
        steps: [
          'Somente quadras ativas/configuradas aparecem nos fluxos permitidos pelo plano',
          'O cliente escolhe quadra e horário no fluxo público (quando liberado)',
          'No painel, use “Abrir reserva pública” para testar o mesmo link',
        ],
        tips: ['Se o módulo não estiver ativo no plano, a empresa recebe aviso no dashboard'],
        tags: ['quadras', 'público', 'reserva'],
      },
    ],
  },
  {
    id: 'arena-agenda-tarifas',
    name: 'Agenda, horários e preços',
    icon: 'fas fa-th',
    description: 'Grade do dia, horário de funcionamento e valores por faixa',
    topics: [
      {
        id: 'arena-horarios-funcionamento',
        title: 'Horários de funcionamento',
        description: 'Configure em quais dias e intervalos a empresa aceita reservas.',
        steps: [
          'Abra o menu Horários (rota do módulo quadras)',
          'Ajuste dias da semana e janelas de atendimento',
          'Salve e confira se a agenda reflete os bloqueios e faixas liberadas',
        ],
        tips: ['Alterações impactam a disponibilidade na reserva pública e na criação manual'],
        tags: ['horários', 'funcionamento', 'agenda'],
      },
      {
        id: 'arena-agenda-dia',
        title: 'Agenda do dia (grade)',
        description: 'Visualização em grade das reservas por quadra e horário.',
        steps: [
          'Acesse “Agenda” ou “Agenda do dia” no menu do módulo',
          'Navegue pela data e pelas quadras',
          'Identifique horários livres e ocupados',
          'Abra uma reserva para editar ou criar nova conforme permitido',
        ],
        tips: ['Combine com a lista de reservas para auditoria por período maior'],
        tags: ['agenda', 'grade', 'dia', 'quadras'],
      },
      {
        id: 'arena-precos-horario',
        title: 'Preços por horário',
        description: 'Defina valores por faixa de horário para reservas de quadra.',
        steps: [
          'Abra “Preços por horário” no módulo quadras',
          'Configure faixas e valores aplicáveis',
          'Salve e valide criando uma reserva de teste se necessário',
        ],
        tips: ['Regras de preço podem interagir com pacotes mensais, se o recurso estiver ativo'],
        tags: ['preços', 'tarifas', 'horário', 'valores'],
      },
    ],
  },
  {
    id: 'arena-reservas-fluxo',
    name: 'Reservas',
    icon: 'fas fa-list',
    description: 'Lista de reservas, filtros e reserva pública',
    topics: [
      {
        id: 'arena-lista-reservas',
        title: 'Lista de reservas',
        description: 'Relatório com data, hora, quadra, cliente, valor e status.',
        steps: [
          'Acesse “Reservas” ou “Lista de reservas” no menu',
          'Filtre por período, quadra e status',
          'Use a paginação quando houver muitos registros',
          'Clique para editar a reserva na tela de agendamento',
        ],
        tips: [
          'A lista costuma mostrar as reservas mais recentes primeiro',
          'Status (pendente, concluído, etc.) ajuda no acompanhamento financeiro',
        ],
        tags: ['reservas', 'lista', 'filtros', 'relatório'],
      },
      {
        id: 'arena-reserva-publica-link',
        title: 'Reserva pública (cliente)',
        description: 'Link para o cliente reservar quadra sem acesso ao painel.',
        steps: [
          'No dashboard arena, use “Abrir reserva pública” para copiar ou testar o link',
          'Envie o link por WhatsApp, site ou QR Code',
          'O cliente escolhe data, quadra e horário conforme regras e disponibilidade',
        ],
        tips: [
          'A disponibilidade depende de horários, preços e limites do plano',
          'Pagamento no local ou online pode variar conforme configuração da empresa',
        ],
        tags: ['reserva pública', 'link', 'cliente', 'sem login'],
      },
      {
        id: 'arena-editar-reserva',
        title: 'Editar ou concluir reserva',
        description: 'Ajuste dados da reserva de quadra pelo fluxo de edição de agendamento.',
        steps: [
          'Na lista ou na agenda, abra a reserva desejada',
          'Altere horário, quadra ou observações respeitando conflitos',
          'Finalize ou registre pagamento conforme o processo da empresa',
        ],
        tips: ['Use a mesma tela de edição de agendamentos do restante do sistema'],
        tags: ['editar', 'reserva', 'agendamento', 'status'],
      },
    ],
  },
  {
    id: 'arena-pacotes',
    name: 'Pacotes mensais',
    icon: 'fas fa-calendar-check',
    description: 'Assinaturas de uso recorrente em quadra (quando liberado no plano)',
    topics: [
      {
        id: 'arena-pacotes-visao',
        title: 'Pacotes mensais de quadra',
        description:
          'Recurso opcional para vender pacotes com uso recorrente; depende do plano e configuração da empresa.',
        steps: [
          'Verifique se o menu “Pacotes mensais” ou equivalente aparece no módulo quadras',
          'Configure ofertas conforme as opções disponíveis na tela',
          'Acompanhe status de pagamento e vigência conforme integração (ex.: checkout)',
        ],
        tips: [
          'Se o menu não aparecer, o recurso pode estar desligado no plano ou nas configurações',
          'Combine com “Preços por horário” para política comercial clara',
        ],
        tags: ['pacotes', 'mensal', 'assinatura', 'quadra'],
      },
    ],
  },
  {
    id: 'arena-agendamentos-app',
    name: 'Agendamentos (visão empresa)',
    icon: 'fas fa-clock',
    description: 'Calendário por dia, semana e mês para a equipe',
    topics: [
      {
        id: 'arena-agendamentos-visoes',
        title: 'Dia, semana e mês',
        description: 'Na tela Agendamentos, alterne o período e filtre por colaborador quando aplicável.',
        steps: [
          'Abra “Agendamento” no menu lateral',
          'Escolha Dia, Semana ou Mês',
          'Na semana, use a faixa de dias para focar em um dia específico',
          'Filtre por colaborador se a operação usar colaboradores vinculados',
        ],
        tips: ['Reservas de quadra também podem ser criadas por este fluxo, conforme regras da empresa'],
        tags: ['agendamentos', 'calendário', 'semana', 'dia', 'mês'],
      },
      {
        id: 'arena-novo-agendamento',
        title: 'Nova reserva pelo painel',
        description: 'Crie reservas para clientes a partir do botão de novo agendamento.',
        steps: [
          'Clique em “Novo Agendamento” (ou atalho no dashboard arena)',
          'Selecione cliente, quadra, data e horário',
          'Revise valores e confirme',
        ],
        tags: ['novo', 'reserva', 'agendamento', 'painel'],
      },
    ],
  },
];
