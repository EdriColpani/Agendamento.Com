/**
 * Sistema de Ajuda - Conteúdo Organizado por Módulos
 * 
 * Este arquivo contém toda a documentação de ajuda do sistema,
 * organizada por módulos e funcionalidades.
 * 
 * IMPORTANTE: Não inclui funcionalidades do admin-dashboard
 */

import type { HelpCategory, HelpTopic } from './helpTypes';
import { helpCategoriesArena } from './helpContentArena';

export { helpCategoriesArena } from './helpContentArena';
export type { HelpTopic, HelpCategory } from './helpTypes';

export const helpCategories: HelpCategory[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: 'fas fa-chart-line',
    description: 'Visão geral do sistema e indicadores principais',
    topics: [
      {
        id: 'dashboard-overview',
        title: 'Visão Geral do Dashboard',
        description: 'O dashboard é a tela principal do sistema, onde você visualiza os principais indicadores e informações da sua empresa.',
        steps: [
          'Acesse o Dashboard pelo menu lateral',
          'Visualize os KPIs principais (faturamento, agendamentos, clientes)',
          'Acompanhe os gráficos de desempenho',
          'Veja os agendamentos do dia e próximos eventos'
        ],
        tips: [
          'Os dados são atualizados em tempo real',
          'Clique nos cards para ver mais detalhes',
          'Use os filtros de data para análises específicas'
        ],
        tags: ['dashboard', 'início', 'indicadores', 'kpi']
      }
    ]
  },
  {
    id: 'agendamentos',
    name: 'Agendamentos',
    icon: 'fas fa-clock',
    description: 'Gerenciamento completo de agendamentos',
    topics: [
      {
        id: 'agendamentos-visualizar',
        title: 'Visualizar Agendamentos',
        description: 'Visualize todos os agendamentos em diferentes visualizações: dia, semana ou mês.',
        steps: [
          'Acesse o menu "Agendamentos"',
          'Escolha a visualização desejada (Dia, Semana, Mês)',
          'Use as setas para navegar entre períodos',
          'Clique em um agendamento para ver detalhes'
        ],
        tips: [
          'Use a busca para filtrar por cliente ou colaborador',
          'Os agendamentos são coloridos por status',
          'Clique em "Hoje" para voltar à data atual'
        ],
        tags: ['agendamentos', 'calendário', 'visualizar', 'navegação']
      },
      {
        id: 'agendamentos-criar',
        title: 'Criar Novo Agendamento',
        description: 'Crie um novo agendamento para um cliente, selecionando serviço, colaborador e horário.',
        steps: [
          'Na tela de Agendamentos, clique em "Novo Agendamento"',
          'Selecione o cliente (ou crie um novo)',
          'Escolha o serviço desejado',
          'Selecione o colaborador responsável',
          'Defina data e horário',
          'Adicione observações (opcional)',
          'Clique em "Salvar"'
        ],
        tips: [
          'O sistema valida conflitos de horário automaticamente',
          'Você pode agendar para múltiplos serviços',
          'Notificações podem ser enviadas ao cliente'
        ],
        tags: ['agendamentos', 'criar', 'novo', 'cliente', 'serviço']
      },
      {
        id: 'agendamentos-editar',
        title: 'Editar Agendamento',
        description: 'Altere informações de um agendamento existente.',
        steps: [
          'Na tela de Agendamentos, clique no agendamento desejado',
          'Clique em "Editar"',
          'Altere as informações necessárias',
          'Salve as alterações'
        ],
        tips: [
          'Alterações de horário são validadas automaticamente',
          'O cliente pode ser notificado sobre mudanças',
          'Histórico de alterações é mantido'
        ],
        tags: ['agendamentos', 'editar', 'alterar', 'modificar']
      },
      {
        id: 'agendamentos-cancelar',
        title: 'Cancelar Agendamento',
        description: 'Cancele um agendamento quando necessário.',
        steps: [
          'Acesse o agendamento desejado',
          'Clique em "Cancelar"',
          'Confirme o cancelamento',
          'Informe o motivo (opcional)'
        ],
        tips: [
          'Agendamentos cancelados podem ser restaurados',
          'O cliente pode ser notificado automaticamente',
          'O horário fica disponível para novos agendamentos'
        ],
        tags: ['agendamentos', 'cancelar', 'excluir']
      },
      {
        id: 'agendamentos-concluir',
        title: 'Concluir Agendamento',
        description: 'Marque um agendamento como concluído após a realização do serviço.',
        steps: [
          'Acesse o agendamento realizado',
          'Clique em "Concluir"',
          'Confirme a conclusão',
          'O agendamento será marcado como concluído'
        ],
        tips: [
          'Agendamentos concluídos aparecem no histórico',
          'Podem ser usados para relatórios de desempenho',
          'O pagamento pode ser registrado na conclusão'
        ],
        tags: ['agendamentos', 'concluir', 'finalizar', 'realizado']
      }
    ]
  },
  {
    id: 'clientes',
    name: 'Clientes',
    icon: 'fas fa-users',
    description: 'Cadastro e gerenciamento de clientes',
    topics: [
      {
        id: 'clientes-visualizar',
        title: 'Visualizar Clientes',
        description: 'Veja a lista completa de clientes cadastrados.',
        steps: [
          'Acesse o menu "Clientes"',
          'Visualize a lista de clientes',
          'Use a busca para filtrar por nome, telefone ou email',
          'Clique em um cliente para ver detalhes'
        ],
        tips: [
          'A lista pode ser ordenada por nome ou data de cadastro',
          'Use os filtros para encontrar clientes específicos',
          'Veja o histórico de agendamentos de cada cliente'
        ],
        tags: ['clientes', 'lista', 'visualizar', 'buscar']
      },
      {
        id: 'clientes-cadastrar',
        title: 'Cadastrar Novo Cliente',
        description: 'Adicione um novo cliente ao sistema.',
        steps: [
          'Na tela de Clientes, clique em "Novo Cliente"',
          'Preencha os dados básicos (nome, telefone, email)',
          'Adicione informações complementares (endereço, observações)',
          'Clique em "Salvar"'
        ],
        tips: [
          'O telefone é obrigatório para notificações',
          'O email permite envio de lembretes',
          'Você pode cadastrar clientes durante a criação de agendamentos'
        ],
        tags: ['clientes', 'cadastrar', 'novo', 'adicionar']
      },
      {
        id: 'clientes-editar',
        title: 'Editar Cliente',
        description: 'Atualize as informações de um cliente existente.',
        steps: [
          'Na lista de clientes, clique no cliente desejado',
          'Clique em "Editar"',
          'Altere as informações necessárias',
          'Salve as alterações'
        ],
        tips: [
          'Alterações são salvas imediatamente',
          'O histórico de agendamentos é preservado',
          'Dados de contato podem ser atualizados a qualquer momento'
        ],
        tags: ['clientes', 'editar', 'alterar', 'atualizar']
      },
      {
        id: 'clientes-historico',
        title: 'Histórico de Agendamentos do Cliente',
        description: 'Visualize todos os agendamentos e serviços realizados por um cliente.',
        steps: [
          'Acesse o perfil do cliente',
          'Clique na aba "Histórico" ou "Agendamentos"',
          'Visualize todos os agendamentos do cliente',
          'Veja detalhes de cada serviço realizado'
        ],
        tips: [
          'O histórico ajuda a entender o perfil do cliente',
          'Use para análises de frequência e preferências',
          'Histórico pode ser usado em relatórios'
        ],
        tags: ['clientes', 'histórico', 'agendamentos', 'serviços']
      }
    ]
  },
  {
    id: 'colaboradores',
    name: 'Colaboradores',
    icon: 'fas fa-user-tie',
    description: 'Gerenciamento de colaboradores e equipe',
    topics: [
      {
        id: 'colaboradores-visualizar',
        title: 'Visualizar Colaboradores',
        description: 'Veja a lista de colaboradores da empresa.',
        steps: [
          'Acesse o menu "Colaboradores"',
          'Visualize a lista de colaboradores',
          'Veja informações básicas de cada colaborador',
          'Clique em um colaborador para ver detalhes'
        ],
        tips: [
          'Colaboradores podem ter diferentes permissões',
          'Veja a disponibilidade de cada colaborador',
          'Acompanhe a performance individual'
        ],
        tags: ['colaboradores', 'equipe', 'visualizar', 'lista']
      },
      {
        id: 'colaboradores-cadastrar',
        title: 'Cadastrar Novo Colaborador',
        description: 'Adicione um novo colaborador à equipe.',
        steps: [
          'Na tela de Colaboradores, clique em "Novo Colaborador"',
          'Preencha os dados pessoais (nome, email, telefone)',
          'Defina as permissões e acessos',
          'Configure a agenda de disponibilidade',
          'Associe os serviços que o colaborador pode realizar',
          'Clique em "Salvar"'
        ],
        tips: [
          'O colaborador receberá um convite por email',
          'Verifique os limites do seu plano antes de adicionar',
          'Configure a agenda para evitar conflitos'
        ],
        tags: ['colaboradores', 'cadastrar', 'novo', 'adicionar', 'convite']
      },
      {
        id: 'colaboradores-editar',
        title: 'Editar Colaborador',
        description: 'Atualize informações e permissões de um colaborador.',
        steps: [
          'Acesse o colaborador desejado',
          'Clique em "Editar"',
          'Altere as informações necessárias',
          'Atualize permissões ou serviços associados',
          'Salve as alterações'
        ],
        tips: [
          'Alterações de permissões podem afetar o acesso imediato',
          'A agenda pode ser atualizada a qualquer momento',
          'Serviços podem ser adicionados ou removidos'
        ],
        tags: ['colaboradores', 'editar', 'alterar', 'permissões']
      },
      {
        id: 'colaboradores-agenda',
        title: 'Configurar Agenda do Colaborador',
        description: 'Defina os horários de disponibilidade de um colaborador.',
        steps: [
          'Acesse o colaborador desejado',
          'Clique em "Configurar Agenda" ou "Horários"',
          'Defina os dias da semana e horários disponíveis',
          'Configure horários especiais ou exceções',
          'Salve a configuração'
        ],
        tips: [
          'A agenda evita agendamentos em horários indisponíveis',
          'Você pode definir diferentes horários por dia',
          'Feriados e ausências podem ser configurados'
        ],
        tags: ['colaboradores', 'agenda', 'horários', 'disponibilidade']
      },
      {
        id: 'colaboradores-servicos',
        title: 'Associar Serviços ao Colaborador',
        description: 'Defina quais serviços um colaborador pode realizar.',
        steps: [
          'Acesse o colaborador desejado',
          'Clique em "Serviços" ou "Serviços Associados"',
          'Selecione os serviços que o colaborador pode realizar',
          'Defina valores de comissão (se aplicável)',
          'Salve as associações'
        ],
        tips: [
          'Colaboradores só aparecem para serviços associados',
          'Comissões podem ser configuradas por serviço',
          'Múltiplos colaboradores podem realizar o mesmo serviço'
        ],
        tags: ['colaboradores', 'serviços', 'associar', 'comissão']
      }
    ]
  },
  {
    id: 'servicos',
    name: 'Serviços',
    icon: 'fas fa-briefcase',
    description: 'Cadastro e gerenciamento de serviços oferecidos',
    topics: [
      {
        id: 'servicos-visualizar',
        title: 'Visualizar Serviços',
        description: 'Veja todos os serviços cadastrados.',
        steps: [
          'Acesse o menu "Serviços"',
          'Visualize a lista de serviços',
          'Veja informações como nome, duração e preço',
          'Clique em um serviço para ver detalhes'
        ],
        tips: [
          'Serviços podem ser filtrados por categoria',
          'Veja quais colaboradores podem realizar cada serviço',
          'Verifique a disponibilidade de cada serviço'
        ],
        tags: ['serviços', 'lista', 'visualizar', 'categorias']
      },
      {
        id: 'servicos-cadastrar',
        title: 'Cadastrar Novo Serviço',
        description: 'Adicione um novo serviço ao catálogo.',
        steps: [
          'Na tela de Serviços, clique em "Novo Serviço"',
          'Preencha o nome do serviço',
          'Defina a duração estimada',
          'Configure o preço',
          'Adicione descrição e observações (opcional)',
          'Clique em "Salvar"'
        ],
        tips: [
          'Verifique os limites do seu plano antes de adicionar',
          'A duração é usada para validar disponibilidade',
          'O preço pode ser alterado a qualquer momento'
        ],
        tags: ['serviços', 'cadastrar', 'novo', 'adicionar']
      },
      {
        id: 'servicos-editar',
        title: 'Editar Serviço',
        description: 'Atualize informações de um serviço existente.',
        steps: [
          'Acesse o serviço desejado',
          'Clique em "Editar"',
          'Altere as informações necessárias',
          'Salve as alterações'
        ],
        tips: [
          'Alterações de preço não afetam agendamentos já criados',
          'A duração pode ser ajustada conforme necessário',
          'Serviços podem ser desativados sem excluir'
        ],
        tags: ['serviços', 'editar', 'alterar', 'atualizar']
      }
    ]
  },
  {
    id: 'financeiro',
    name: 'Financeiro',
    icon: 'fas fa-dollar-sign',
    description: 'Controle financeiro e movimentações de caixa',
    topics: [
      {
        id: 'financeiro-visualizar',
        title: 'Visualizar Movimentações Financeiras',
        description: 'Acompanhe todas as entradas e saídas do caixa.',
        steps: [
          'Acesse o menu "Financeiro"',
          'Visualize as movimentações do período',
          'Use filtros para buscar por data, tipo ou categoria',
          'Veja o saldo atual do caixa'
        ],
        tips: [
          'Movimentações são organizadas por data',
          'Recebimentos de agendamentos aparecem automaticamente',
          'Use os filtros para análises específicas'
        ],
        tags: ['financeiro', 'caixa', 'movimentações', 'saldo']
      },
      {
        id: 'financeiro-recebimento',
        title: 'Registrar Recebimento',
        description: 'Registre um recebimento manual ou de agendamento.',
        steps: [
          'Na tela Financeiro, clique em "Nova Transação"',
          'Selecione o tipo "Recebimento"',
          'Escolha a forma de pagamento',
          'Informe o valor e a descrição',
          'Associe a um agendamento (se aplicável)',
          'Salve a transação'
        ],
        tips: [
          'Recebimentos de agendamentos podem ser registrados automaticamente',
          'Diferentes formas de pagamento podem ser configuradas',
          'O valor é adicionado ao saldo do caixa imediatamente'
        ],
        tags: ['financeiro', 'recebimento', 'entrada', 'pagamento']
      },
      {
        id: 'financeiro-despesa',
        title: 'Registrar Despesa',
        description: 'Registre uma despesa ou saída do caixa.',
        steps: [
          'Na tela Financeiro, clique em "Nova Transação"',
          'Selecione o tipo "Despesa"',
          'Escolha a categoria da despesa',
          'Informe o valor e a descrição',
          'Adicione comprovante (opcional)',
          'Salve a transação'
        ],
        tips: [
          'Despesas são subtraídas do saldo do caixa',
          'Categorias ajudam na organização',
          'Comprovantes podem ser anexados para controle'
        ],
        tags: ['financeiro', 'despesa', 'saída', 'gasto']
      },
      {
        id: 'financeiro-fechar-caixa',
        title: 'Fechar Caixa',
        description: 'Realize o fechamento diário do caixa.',
        steps: [
          'Acesse "Fechar Caixa" no menu Financeiro',
          'Revise todas as movimentações do dia',
          'Confirme o saldo em dinheiro',
          'Adicione observações (opcional)',
          'Clique em "Fechar Caixa"'
        ],
        tips: [
          'O fechamento cria um registro permanente',
          'Você pode fechar o caixa a qualquer momento',
          'Histórico de fechamentos fica disponível para consulta'
        ],
        tags: ['financeiro', 'fechar', 'caixa', 'fechamento']
      },
      {
        id: 'financeiro-comissoes',
        title: 'Pagamento de Comissões',
        description: 'Gerencie e registre pagamentos de comissões aos colaboradores.',
        steps: [
          'Acesse "Pagamento de Comissões" no menu Financeiro',
          'Visualize as comissões pendentes',
          'Selecione os colaboradores e períodos',
          'Registre os pagamentos realizados',
          'Confirme as transações'
        ],
        tips: [
          'Comissões são calculadas automaticamente',
          'Você pode filtrar por colaborador ou período',
          'Histórico de pagamentos fica registrado'
        ],
        tags: ['financeiro', 'comissões', 'colaboradores', 'pagamento']
      }
    ]
  },
  {
    id: 'estoque',
    name: 'Estoque',
    icon: 'fas fa-boxes',
    description: 'Controle de produtos e estoque',
    topics: [
      {
        id: 'estoque-visualizar',
        title: 'Visualizar Estoque',
        description: 'Veja todos os produtos cadastrados e seus estoques.',
        steps: [
          'Acesse o menu "Estoque"',
          'Visualize a lista de produtos',
          'Veja quantidades disponíveis',
          'Use filtros para buscar produtos específicos'
        ],
        tips: [
          'Produtos com estoque baixo são destacados',
          'Você pode ver o histórico de movimentações',
          'Use a busca para encontrar produtos rapidamente'
        ],
        tags: ['estoque', 'produtos', 'visualizar', 'quantidade']
      },
      {
        id: 'estoque-cadastrar',
        title: 'Cadastrar Novo Produto',
        description: 'Adicione um novo produto ao estoque.',
        steps: [
          'Na tela de Estoque, clique em "Novo Produto"',
          'Preencha nome, descrição e categoria',
          'Defina o preço de compra e venda',
          'Informe a quantidade inicial',
          'Configure alertas de estoque mínimo (opcional)',
          'Salve o produto'
        ],
        tips: [
          'O preço de venda pode ser usado em vendas',
          'Alertas ajudam a controlar reposição',
          'Categorias facilitam a organização'
        ],
        tags: ['estoque', 'produto', 'cadastrar', 'adicionar']
      },
      {
        id: 'estoque-editar',
        title: 'Editar Produto',
        description: 'Atualize informações de um produto existente.',
        steps: [
          'Acesse o produto desejado',
          'Clique em "Editar"',
          'Altere as informações necessárias',
          'Salve as alterações'
        ],
        tips: [
          'Quantidades podem ser ajustadas manualmente',
          'Preços podem ser atualizados a qualquer momento',
          'Histórico de alterações é mantido'
        ],
        tags: ['estoque', 'produto', 'editar', 'alterar']
      },
      {
        id: 'estoque-movimentacao',
        title: 'Registrar Movimentação de Estoque',
        description: 'Registre entradas ou saídas de produtos.',
        steps: [
          'Acesse o produto desejado',
          'Clique em "Movimentar Estoque"',
          'Selecione o tipo (entrada ou saída)',
          'Informe a quantidade',
          'Adicione observações (opcional)',
          'Confirme a movimentação'
        ],
        tips: [
          'Movimentações são registradas automaticamente',
          'O estoque é atualizado imediatamente',
          'Histórico completo fica disponível'
        ],
        tags: ['estoque', 'movimentação', 'entrada', 'saída']
      }
    ]
  },
  {
    id: 'relatorios',
    name: 'Relatórios',
    icon: 'fas fa-chart-bar',
    description: 'Relatórios e análises do negócio',
    topics: [
      {
        id: 'relatorios-visualizar',
        title: 'Visualizar Relatórios',
        description: 'Acesse os relatórios disponíveis do sistema.',
        steps: [
          'Acesse o menu "Relatórios"',
          'Escolha o tipo de relatório desejado',
          'Configure os filtros (período, colaborador, etc.)',
          'Visualize os dados e gráficos',
          'Exporte o relatório (se disponível)'
        ],
        tips: [
          'Relatórios podem ser filtrados por período',
          'Colaboradores veem apenas seus próprios dados',
          'Dados são atualizados em tempo real'
        ],
        tags: ['relatórios', 'análise', 'dados', 'gráficos']
      },
      {
        id: 'relatorios-faturamento',
        title: 'Relatório de Faturamento',
        description: 'Analise o faturamento por período, serviço ou colaborador.',
        steps: [
          'Acesse Relatórios',
          'Selecione "Faturamento"',
          'Escolha o período desejado',
          'Aplique filtros adicionais (opcional)',
          'Visualize gráficos e tabelas',
          'Exporte para PDF (se disponível)'
        ],
        tips: [
          'O faturamento é baseado em movimentações de caixa',
          'Você pode comparar períodos diferentes',
          'Gráficos facilitam a visualização de tendências'
        ],
        tags: ['relatórios', 'faturamento', 'receita', 'análise']
      },
      {
        id: 'relatorios-agendamentos',
        title: 'Relatório de Agendamentos',
        description: 'Analise a quantidade e tipos de agendamentos realizados.',
        steps: [
          'Acesse Relatórios',
          'Selecione "Agendamentos"',
          'Configure período e filtros',
          'Visualize estatísticas e gráficos',
          'Analise por colaborador ou serviço'
        ],
        tips: [
          'Veja taxa de comparecimento',
          'Identifique horários mais procurados',
          'Analise performance por colaborador'
        ],
        tags: ['relatórios', 'agendamentos', 'estatísticas', 'performance']
      },
      {
        id: 'relatorios-colaboradores',
        title: 'Relatório de Performance de Colaboradores',
        description: 'Avalie o desempenho individual de cada colaborador.',
        steps: [
          'Acesse Relatórios',
          'Selecione "Performance de Colaboradores"',
          'Escolha o período de análise',
          'Visualize métricas por colaborador',
          'Compare desempenhos'
        ],
        tips: [
          'Disponível apenas para proprietários',
          'Veja quantidade de serviços realizados',
          'Analise faturamento por colaborador'
        ],
        tags: ['relatórios', 'colaboradores', 'performance', 'desempenho']
      }
    ]
  },
  {
    id: 'fidelidade',
    name: 'Fidelidade',
    icon: 'fas fa-gift',
    description: 'Programa de fidelidade e pontos',
    topics: [
      {
        id: 'fidelidade-visualizar',
        title: 'Visualizar Programa de Fidelidade',
        description: 'Acompanhe o programa de pontos e fidelidade dos clientes.',
        steps: [
          'Acesse o menu "Fidelidade"',
          'Visualize clientes e seus pontos',
          'Veja histórico de pontuações',
          'Acompanhe resgates realizados'
        ],
        tips: [
          'Pontos são acumulados automaticamente',
          'Configure regras de pontuação',
          'Clientes podem resgatar benefícios'
        ],
        tags: ['fidelidade', 'pontos', 'programa', 'benefícios']
      },
      {
        id: 'fidelidade-configurar',
        title: 'Configurar Regras de Pontuação',
        description: 'Defina como os clientes ganham pontos.',
        steps: [
          'Acesse Fidelidade',
          'Clique em "Configurar" ou "Regras"',
          'Defina quantos pontos por real gasto',
          'Configure bônus especiais (opcional)',
          'Salve as configurações'
        ],
        tips: [
          'Regras podem ser personalizadas',
          'Bônus podem ser aplicados em datas especiais',
          'Alterações afetam apenas novos agendamentos'
        ],
        tags: ['fidelidade', 'configurar', 'pontos', 'regras']
      }
    ]
  },
  {
    id: 'planos',
    name: 'Planos',
    icon: 'fas fa-gem',
    description: 'Gerenciamento de assinatura e planos',
    topics: [
      {
        id: 'planos-visualizar',
        title: 'Visualizar Planos Disponíveis',
        description: 'Veja os planos de assinatura disponíveis e escolha o ideal para sua empresa.',
        steps: [
          'Acesse o menu "Planos"',
          'Visualize os planos disponíveis',
          'Compare funcionalidades e limites',
          'Veja o plano atual da sua empresa',
          'Escolha um plano para assinar ou alterar'
        ],
        tips: [
          'Cada plano tem limites específicos (colaboradores, serviços)',
          'Você pode alterar de plano a qualquer momento',
          'O plano atual é destacado'
        ],
        tags: ['planos', 'assinatura', 'comparar', 'escolher']
      },
      {
        id: 'planos-assinar',
        title: 'Assinar ou Alterar Plano',
        description: 'Assine um novo plano ou altere o plano atual.',
        steps: [
          'Acesse Planos',
          'Escolha o plano desejado',
          'Clique em "Assinar" ou "Alterar Plano"',
          'Revise as informações',
          'Complete o pagamento',
          'Confirme a assinatura'
        ],
        tips: [
          'Alterações de plano podem ter efeito imediato',
          'Verifique os limites antes de alterar',
          'Suporte está disponível para dúvidas'
        ],
        tags: ['planos', 'assinar', 'alterar', 'pagamento']
      }
    ]
  },
  {
    id: 'configuracoes',
    name: 'Configurações',
    icon: 'fas fa-cog',
    description: 'Configurações gerais do sistema',
    topics: [
      {
        id: 'config-geral',
        title: 'Configurações Gerais',
        description: 'Acesse e configure as opções gerais do sistema.',
        steps: [
          'Acesse o menu "Configurações"',
          'Visualize as opções disponíveis',
          'Altere as configurações desejadas',
          'Salve as alterações'
        ],
        tips: [
          'Configurações podem variar conforme o plano',
          'Alterações são salvas automaticamente',
          'Algumas configurações requerem permissões específicas'
        ],
        tags: ['configurações', 'geral', 'opções', 'sistema']
      },
      {
        id: 'config-empresa',
        title: 'Editar Dados da Empresa',
        description: 'Atualize informações da sua empresa.',
        steps: [
          'Acesse Configurações ou "Dados da Empresa"',
          'Edite as informações necessárias',
          'Atualize logo, endereço, contatos',
          'Salve as alterações'
        ],
        tips: [
          'Dados da empresa aparecem em perfis públicos',
          'Logo pode ser atualizado a qualquer momento',
          'Informações de contato são importantes para clientes'
        ],
        tags: ['configurações', 'empresa', 'editar', 'dados']
      }
    ]
  },
  {
    id: 'mensagens',
    name: 'Mensagens WhatsApp',
    icon: 'fas fa-comments',
    description: 'Envio de mensagens automáticas via WhatsApp',
    topics: [
      {
        id: 'mensagens-visualizar',
        title: 'Gerenciar Mensagens WhatsApp',
        description: 'Configure e gerencie o envio de mensagens automáticas via WhatsApp.',
        steps: [
          'Acesse o menu "Mensagens WhatsApp"',
          'Visualize templates e configurações',
          'Configure mensagens automáticas',
          'Acompanhe o envio de mensagens'
        ],
        tips: [
          'Disponível apenas para planos específicos',
          'Mensagens podem ser personalizadas',
          'Histórico de envios fica disponível'
        ],
        tags: ['mensagens', 'whatsapp', 'automação', 'templates']
      }
    ]
  },
  {
    id: 'perfil',
    name: 'Perfil',
    icon: 'fas fa-user',
    description: 'Gerenciamento do seu perfil pessoal',
    topics: [
      {
        id: 'perfil-visualizar',
        title: 'Visualizar e Editar Perfil',
        description: 'Acesse e atualize suas informações pessoais.',
        steps: [
          'Clique no seu nome no canto superior direito',
          'Selecione "Perfil"',
          'Visualize suas informações',
          'Edite os dados desejados',
          'Salve as alterações'
        ],
        tips: [
          'Email e senha podem ser alterados',
          'Foto de perfil pode ser atualizada',
          'Alterações de email podem requerer confirmação'
        ],
        tags: ['perfil', 'usuário', 'editar', 'informações']
      },
      {
        id: 'perfil-senha',
        title: 'Alterar Senha',
        description: 'Altere sua senha de acesso ao sistema.',
        steps: [
          'Acesse seu Perfil',
          'Clique em "Alterar Senha"',
          'Informe a senha atual',
          'Digite a nova senha',
          'Confirme a nova senha',
          'Salve a alteração'
        ],
        tips: [
          'Use senhas fortes e seguras',
          'A senha deve ter no mínimo 6 caracteres',
          'Alterações são aplicadas imediatamente'
        ],
        tags: ['perfil', 'senha', 'segurança', 'alterar']
      }
    ]
  }
];

/**
 * Catálogo exibido na Central de Ajuda: modo serviço (padrão) ou modo arena (somente quadras).
 */
export function getHelpCategories(isArenaMode: boolean): HelpCategory[] {
  return isArenaMode ? helpCategoriesArena : helpCategories;
}

/**
 * Busca tópicos por termo de pesquisa
 * @param catalog — use o mesmo catálogo da tela (serviço ou arena)
 */
export function searchHelpTopics(searchTerm: string, catalog: HelpCategory[] = helpCategories): HelpTopic[] {
  const term = searchTerm.toLowerCase().trim();
  if (!term) return [];

  const results: HelpTopic[] = [];

  catalog.forEach((category) => {
    category.topics.forEach((topic) => {
      const matchesTitle = topic.title.toLowerCase().includes(term);
      const matchesDescription = topic.description.toLowerCase().includes(term);
      const matchesTags = topic.tags.some((tag) => tag.toLowerCase().includes(term));

      if (matchesTitle || matchesDescription || matchesTags) {
        results.push(topic);
      }
    });
  });

  return results;
}

/**
 * Busca categoria por ID
 */
export function getCategoryById(
  categoryId: string,
  catalog: HelpCategory[] = helpCategories,
): HelpCategory | undefined {
  return catalog.find((cat) => cat.id === categoryId);
}

/**
 * Busca tópico por ID
 */
export function getTopicById(topicId: string, catalog: HelpCategory[] = helpCategories): HelpTopic | undefined {
  for (const category of catalog) {
    const topic = category.topics.find((t) => t.id === topicId);
    if (topic) return topic;
  }
  return undefined;
}

