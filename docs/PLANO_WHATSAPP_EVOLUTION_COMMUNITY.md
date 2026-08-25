# PLANOAGENDA — IMPLEMENTAÇÃO DO MÓDULO WHATSAPP

## OBJETIVO

Implementar no PlanoAgenda um módulo próprio de envio de notificações pelo WhatsApp utilizando inicialmente:

* **Evolution API Community / self-hosted** (instalação própria)
* **Baileys** (modo suportado pela Evolution Community)

O objetivo é substituir futuramente a API externa de WhatsApp atualmente utilizada pelo sistema, mantendo exatamente as regras de negócio existentes.

### Escopo permitido

O WhatsApp será utilizado **EXCLUSIVAMENTE** como canal de envio das notificações automáticas do sistema de agendamento.

Fluxo alvo:

```text
AGENDAMENTO → NOTIFICAÇÃO PROGRAMADA → WHATSAPP → CLIENTE
```

### Escopo proibido (NÃO implementar neste projeto)

* chatbot
* IA
* atendimento automático
* campanhas
* disparos em massa
* grupos
* CRM
* leitura de mensagens
* respostas automáticas
* envio de áudio
* envio de imagens
* envio de documentos
* catálogo
* marketing

---

## DECISÃO DE PRODUTO — EVOLUTION COMMUNITY / SELF-HOSTED

Utilizar **somente** Evolution API **Community / self-hosted** nesta implementação.

### Obrigatório

* Instalar e operar a Evolution sob controle do PlanoAgenda (Docker/VPS/self-hosted).
* Usar versão Community estável e documentada no projeto (tag/versão exata).
* Baileys apenas no modo suportado pela Evolution Community.
* Registrar no projeto a versão utilizada e as condições de licença da Community.

### Proibido neste momento

* Contratar plano comercial da Evolution.
* Usar serviço gerenciado / cloud pago da Evolution.
* Depender de licença paga, ativação comercial ou recursos exclusivos de planos pagos.
* Implementar recurso que só exista em edição comercial — se necessário, adaptar à Community ou documentar como limitação.

### Futuro (fora do escopo atual)

* Eventual plano comercial da Evolution.
* Meta Cloud API.
* Outro provider oficial.

Essas opções devem ser possíveis via abstração `WhatsAppProvider`, mas **não** fazem parte desta entrega.

---

## REGRA FUNDAMENTAL

**NÃO** remover, desativar ou modificar a API externa de WhatsApp atualmente utilizada antes que o novo sistema esteja completamente testado.

O sistema atual deve continuar funcionando durante toda a implementação.

A nova arquitetura deverá permitir escolher o provider:

* `external` — API externa atual
* `evolution` — Evolution API Community + Baileys (self-hosted)

Somente após validação completa será feita a migração definitiva.

---

## REGRA DE CONTROLE DO PROJETO (OBRIGATÓRIA)

Antes de alterar rotinas de envio automático / scheduler / worker WhatsApp:

1. Solicitar aprovação explícita do proprietário.
2. Apresentar checklist respondido:
   * problema alvo
   * impacto no scheduler
   * risco de duplicidade
   * risco de atraso
   * estratégia de rollback
   * teste de validação final
3. Sem aprovação + checklist, a mudança deve ser recusada.
4. Manter **uma única fonte oficial** de scheduler automático.
5. **Nunca** introduzir segundo scheduler automático sem aprovação explícita.

---

## ARQUITETURA DESEJADA

Criar uma camada de abstração:

`WhatsAppProvider`

Essa camada desacopla o PlanoAgenda do fornecedor de WhatsApp.

```text
PLANOAGENDA
    ↓
Sistema de notificações (regras atuais)
    ↓
WhatsAppProvider
    ↓
┌──────────────────────────────┐
│ external (API atual)         │
│ evolution (Community/self-hosted + Baileys) │
│ (futuro) Meta Cloud API      │
└──────────────────────────────┘
```

A lógica de negócio **não** deve saber se a mensagem será enviada pela API antiga ou pela Evolution.

---

## ORDEM OBRIGATÓRIA DE EXECUÇÃO

Execute **nesta ordem**, uma fase por vez.

Após cada fase: validar → reportar → aguardar autorização para a próxima.

**NÃO** tentar implementar todas as fases de uma única vez.

---

# FASE 1 — AUDITORIA DO SISTEMA ATUAL

**Status esperado:** análise apenas. **NÃO alterar código.**

### Objetivo

Mapear completamente o fluxo atual de WhatsApp no PlanoAgenda.

### Identificar

1. Onde os agendamentos são criados.
2. Onde ficam armazenados.
3. Estrutura das tabelas relacionadas.
4. Como os clientes são armazenados.
5. Como o telefone do cliente é armazenado.
6. Como atualmente são criadas as notificações.
7. Como funciona o cron.
8. Como funciona o worker.
9. Como a API externa de WhatsApp é chamada.
10. Quais endpoints existentes fazem envio.
11. Quais funções fazem o cálculo do horário de envio.
12. Como são controlados os status: `pending`, `sending`/`processing`, `sent`, `failed`.
13. Como são feitas tentativas/retries.
14. Como funciona a mensagem de agradecimento.
15. Como são configuradas as três mensagens anteriores ao horário.
16. Quais variáveis ambientais existem.
17. Quais secrets existem.
18. Quais componentes do frontend já existem para notificações/WhatsApp.
19. Quais logs existem.
20. Se existem webhooks relacionados à API atual.
21. Qual é a fonte única oficial do scheduler hoje.
22. Quais proteções anti-duplicidade já existem.

### Entrega da Fase 1

Relatório objetivo contendo:

* arquitetura atual
* arquivos envolvidos
* tabelas envolvidas
* funções envolvidas
* workers/cron envolvidos
* fluxo completo da notificação
* fluxo das três mensagens
* fluxo do agradecimento
* pontos de integração
* riscos
* pontos que precisam ser preservados
* possíveis conflitos
* proposta de implementação das fases seguintes (sem código ainda)

### Critério de conclusão

Relatório entregue e aprovado pelo proprietário.

**Aguardar autorização explícita para iniciar a Fase 2.**

---

# FASE 2 — CRIAR A ABSTRAÇÃO WHATSAPP PROVIDER

### Objetivo

Desacoplar o PlanoAgenda do fornecedor de WhatsApp.

### Criar

Interface/serviço `WhatsAppProvider` com métodos equivalentes a (nomes adaptáveis à arquitetura atual):

* `connect`
* `disconnect`
* `getConnectionStatus`
* `getQRCode`
* `sendTextMessage`
* `getInstanceStatus`

### Implementações iniciais

1. `ExternalWhatsAppProvider` — encapsula a API atualmente utilizada.
2. `EvolutionWhatsAppProvider` — preparação para Evolution Community (pode começar stub/parcial, sem envio em produção ainda).

### Regras

* A lógica de negócio chama apenas `WhatsAppProvider`.
* Nenhuma regra de lembrete/agradecimento deve importar detalhes da Evolution ou da API externa.
* Não remover o caminho atual de envio nesta fase.

### Entrega

* Interface criada
* Provider externo encapsulado
* Pontos de chamada identificados/refatorados de forma mínima e segura
* Testes básicos de compilação/contrato

### Critério de conclusão

Envios atuais continuam funcionando via `external`.

**Aguardar autorização para a Fase 3.**

---

# FASE 3 — EVOLUTION API + BAILEYS (COMMUNITY / SELF-HOSTED)

### Objetivo

Integrar Evolution API Community self-hosted como backend técnico do novo provider.

### Regras obrigatórias

* Usar apenas edição **Community / open self-hosted**.
* Instalar e operar sob controle do PlanoAgenda (Docker ou equivalente).
* **Proibido:** plano comercial, SaaS gerenciado, licença paga.
* Usar versão Community estável; registrar tag/versão exata no projeto.
* Baileys apenas no modo suportado pela Evolution Community.
* **NÃO** usar Selenium, Puppeteer ou automação de navegador.
* Se um recurso exigir edição comercial: não implementar; documentar limitação.

### Entrega

* Serviço Evolution Community rodando em ambiente de desenvolvimento/teste
* Credenciais/secrets apenas em variáveis de ambiente
* `EvolutionWhatsAppProvider` capaz de falar com a API Community
* Nota de versão + licença Community no repositório

### Critério de conclusão

Health check da Evolution Community OK e provider consegue autenticar na API self-hosted.

**Aguardar autorização para a Fase 4.**

---

# FASE 4 — GERENCIAMENTO DE INSTÂNCIAS

### Objetivo

Garantir isolamento multiempresa: uma sessão WhatsApp por estabelecimento.

### Relacionamento

```text
empresa
  ↓
whatsapp_instance
  ↓
Evolution API Community (self-hosted)
  ↓
WhatsApp conectado
```

### Cada empresa deve possuir

* `instance_id`
* `status`
* número conectado (quando disponível)
* data da conexão
* última atividade
* última desconexão
* informações necessárias para reconexão
* status de erro

### Regras

* **NUNCA** compartilhar sessão de WhatsApp entre empresas.
* Credenciais e dados sensíveis armazenados de forma segura.
* **NÃO** armazenar secrets no frontend.
* **NÃO** expor API keys no navegador.
* Antes de migration: apresentar impacto e obter aprovação.

### Entrega

* Modelo de dados / migration proposta e aprovada
* CRUD backend de instâncias por empresa
* Isolamento multi-tenant validado em nível de dados

### Critério de conclusão

Empresa A e Empresa B não compartilham `instance_id` nem credenciais.

**Aguardar autorização para a Fase 5.**

---

# FASE 5 — CONEXÃO POR QR CODE

### Objetivo

Permitir que cada estabelecimento conecte seu WhatsApp pela interface do PlanoAgenda.

### UI (Configurações → WhatsApp)

Estado desconectado:

```text
WhatsApp
Status: 🔴 Não conectado

Conecte o WhatsApp da sua empresa
para enviar lembretes automáticos.

[ CONECTAR WHATSAPP ]
```

Ao clicar:

1. Criar/obter instância na Evolution Community.
2. Solicitar QR Code.
3. Exibir QR Code.
4. Atualizar status da conexão.
5. Detectar conexão concluída.
6. Atualizar interface automaticamente.

Estado conectado:

```text
🟢 WhatsApp conectado
- número conectado
- status
- última conexão

[ DESCONECTAR WHATSAPP ]
```

### Regras

* Toda operação sensível no backend.
* Frontend só exibe status/QR recebidos de endpoints autenticados e autorizados por empresa.

### Entrega

* Tela de conexão WhatsApp
* Fluxo conectar / desconectar
* Atualização de status em tempo quase real (polling ou webhook-driven)

### Critério de conclusão

Empresa de teste conecta e desconecta com sucesso via UI.

**Aguardar autorização para a Fase 6.**

---

# FASE 6 — WEBHOOKS

### Objetivo

Manter o estado das instâncias atualizado via eventos da Evolution Community.

### Eventos mínimos

* conexão iniciada
* conexão estabelecida
* desconexão
* erro
* mensagem enviada
* falha no envio
* demais eventos necessários ao estado da instância

### Regras

* Endpoint seguro para receber webhooks.
* Validar origem/autenticação conforme mecanismos disponíveis na Community.
* **NÃO** aceitar webhook sem validação.
* Registrar logs sem expor dados sensíveis.

### Entrega

* Endpoint de webhook
* Validação de autenticação
* Atualização de status da instância
* Logs seguros

### Critério de conclusão

Conectar/desconectar reflete corretamente no banco/UI via webhook.

**Aguardar autorização para a Fase 7.**

---

# FASE 7 — ENVIO DE MENSAGEM

### Objetivo

Implementar **somente** `sendTextMessage`.

### Entrada do provider

* telefone
* mensagem
* identificação da empresa
* identificação da notificação
* identificação do agendamento

### Exemplo de mensagem

```text
Olá, Maria! 👋

Passando para lembrar que você tem um horário agendado amanhã às 14:30.

✂️ Corte feminino

Esperamos você!
```

### Regras

* Envio apenas de texto.
* Usar instância da empresa correta.
* Não implementar mídia, áudio, documentos, grupos, etc.

### Entrega

* `EvolutionWhatsAppProvider.sendTextMessage` funcional em ambiente de teste
* Envio manual de teste por empresa

### Critério de conclusão

Mensagem de texto de teste chega ao WhatsApp do número destino via Evolution Community.

**Aguardar autorização para a Fase 8.**

---

# FASE 8 — PRESERVAR AS REGRAS ATUAIS

### Objetivo

O novo provider substitui **somente o canal de transporte**.

### Reutilizar (não recriar)

* quantidade máxima de 3 lembretes antes do horário
* horários configuráveis pelo estabelecimento
* regras de ativação/desativação
* mensagem de agradecimento
* templates existentes
* variáveis existentes
* cancelamento
* reagendamento
* retries existentes
* logs existentes
* histórico existente

### Exemplo preservado

```text
Agendamento: 15:00

1º lembrete: 24h antes → WhatsApp
2º lembrete: 2h antes  → WhatsApp
3º lembrete: 30min antes → WhatsApp
atendimento concluído → agradecimento
```

### Regras

* **NÃO** criar nova lógica de agendamento de mensagens se a atual funciona.
* **NÃO** criar mais mensagens do que as regras atuais permitem.
* **NÃO** alterar comportamento de cancelamento/reagendamento.

### Entrega

* Mapa “regra atual → ponto de integração com provider”
* Confirmação de que nenhuma regra de negócio foi reescrita sem necessidade

### Critério de conclusão

Mesmas regras, novo transporte apenas quando `provider = evolution`.

**Aguardar autorização para a Fase 9.**

---

# FASE 9 — FILA DE NOTIFICAÇÕES

### Objetivo

Avaliar e reutilizar a fila existente (`message_send_log` ou equivalente).

### Estados mínimos

```text
PENDING → PROCESSING → SENT

ou

PENDING → PROCESSING → FAILED → RETRY → PROCESSING
```

### Regras

* Se a fila atual for adequada: **reutilizar**.
* Só criar estrutura nova se houver lacuna comprovada na auditoria.
* Cada mensagem com identificação única / idempotência.
* **Nunca** enviar a mesma notificação duas vezes por erro de processamento.
* Proteção contra duplicidade obrigatória.

### Entrega

* Decisão documentada: reuso vs extensão mínima
* Garantias de idempotência verificadas

### Critério de conclusão

Teste de reprocessamento não gera envio duplicado.

**Aguardar autorização para a Fase 10.**

---

# FASE 10 — WORKER / CRON

### Objetivo

Reutilizar o worker/cron oficial existente do PlanoAgenda.

### Worker deve

1. Buscar notificações pendentes.
2. Verificar se a empresa possui WhatsApp conectado (quando provider = evolution).
3. Verificar se o agendamento ainda é válido.
4. Verificar se a notificação ainda deve ser enviada.
5. Enviar através do `WhatsAppProvider`.
6. Registrar resultado.
7. Registrar erro quando houver.
8. Aplicar retry conforme a política existente.

### Regras críticas

* **NÃO** criar segundo sistema de cron desnecessário.
* Manter a fonte única oficial de scheduler.
* Qualquer alteração no worker exige checklist + aprovação explícita.

### Entrega

* Worker atual integrado ao `WhatsAppProvider`
* Sem segundo job automático paralelo

### Critério de conclusão

Um único orquestrador dispara envios; provider escolhido por configuração.

**Aguardar autorização para a Fase 11.**

---

# FASE 11 — STATUS DO WHATSAPP

### Objetivo

Padronizar estados da conexão por empresa.

### Estados

* `CONNECTING`
* `CONNECTED`
* `DISCONNECTED`
* `ERROR`

### UI

* 🟢 Conectado
* 🟡 Conectando
* 🔴 Desconectado
* ⚠️ Erro

### Política quando desconectado

* O sistema **NÃO** deve tentar enviar indefinidamente.
* Notificações permanecem controladas na fila.
* Seguir política segura de retry (sem storm de tentativas).

### Entrega

* Enum/status consistente backend + frontend
* Política de retry quando desconectado documentada e implementada

### Critério de conclusão

Com WhatsApp desconectado, fila não explode em retries agressivos.

**Aguardar autorização para a Fase 12.**

---

# FASE 12 — LOGS E MONITORAMENTO

### Objetivo

Histórico auditável de cada envio, sem dados sensíveis desnecessários.

### Exemplo de registro

* Empresa: Barbearia X
* Cliente: João
* Agendamento: 26/08/2026 14:30
* Tipo: `LEMBRETE_1`
* Status: `SENT`
* Data: 25/08/2026 14:30
* Provider: `evolution`

### Também registrar

* erro de conexão
* erro de envio
* timeout
* número inválido
* instância desconectada
* falha da Evolution Community
* falha de autenticação

### Regras

* Não armazenar conteúdo sensível desnecessariamente.
* Não logar tokens/secrets.

### Entrega

* Histórico consultável por empresa
* Campos de provider/erro padronizados

### Critério de conclusão

É possível auditar um envio completo sem abrir secrets.

**Aguardar autorização para a Fase 13.**

---

# FASE 13 — CONFIGURAÇÃO DE PROVIDER

### Objetivo

Permitir escolha controlada do transporte.

### Configuração

`WHATSAPP_PROVIDER` (e/ou equivalente por empresa):

* `external` — sistema atual
* `evolution` — Evolution Community self-hosted

### Regras

* Durante testes: default `external`.
* Selecionar empresas piloto com `evolution`.
* **Não** remover o provider externo.

### Entrega

* Switch global e/ou por empresa
* Documentação de como alternar com segurança

### Critério de conclusão

Empresa piloto em `evolution`; demais em `external`, sem impacto cruzado.

**Aguardar autorização para a Fase 14.**

---

# FASE 14 — TESTE CONTROLADO

### Objetivo

Validar antes de usuários reais em massa.

### Checklist de testes

1. Criar instância.
2. Gerar QR Code.
3. Conectar WhatsApp.
4. Detectar conexão.
5. Enviar mensagem manual de teste.
6. Desconectar.
7. Reconectar.
8. Enviar lembrete 1.
9. Enviar lembrete 2.
10. Enviar lembrete 3.
11. Enviar agradecimento.
12. Cancelar agendamento antes do lembrete.
13. Reagendar.
14. Cliente sem telefone.
15. Número inválido.
16. WhatsApp desconectado.
17. Evolution Community indisponível.
18. Timeout.
19. Retry.
20. Duplicidade.
21. Múltiplas empresas.
22. Duas empresas com dois WhatsApps diferentes.

### Entrega

* Relatório de testes com pass/fail
* Bugs corrigidos ou listados com severidade

### Critério de conclusão

Itens críticos (1–13, 16, 19, 20, 22) passando.

**Aguardar autorização para a Fase 15.**

---

# FASE 15 — TESTE MULTIEMPRESA

### Objetivo

Garantir isolamento absoluto entre empresas.

### Cenário mínimo

```text
Empresa A → WhatsApp A
Empresa B → WhatsApp B
```

### Garantir que

Mensagem da Empresa A **NUNCA** seja enviada pelo WhatsApp da Empresa B.

### Isolar e testar

* instância
* credenciais
* fila
* mensagens
* logs
* webhooks
* configurações

### Entrega

* Evidências de isolamento (IDs de instância, logs, números remetentes)

### Critério de conclusão

Zero vazamento cross-tenant em testes documentados.

**Aguardar autorização para a Fase 16.**

---

# FASE 16 — MIGRAÇÃO GRADUAL

### Objetivo

Migrar sem desligar a API externa de imediato.

### Sequência

1. `provider = external` (padrão)
2. 1 empresa de teste → `evolution`
3. Validar período controlado
4. Expandir gradualmente: 1 → 5 → 10 → 25 → 50 empresas

### Monitorar

* desconexões
* mensagens enviadas
* falhas
* CPU / RAM do host da Evolution Community
* tempo de resposta
* estabilidade
* sessões simultâneas

### Critério de conclusão

Decisão explícita do proprietário sobre continuar expansão ou pausar.

**Não migrar 100% sem aprovação.**

---

# FASE 17 — INFRAESTRUTURA

### Objetivo

Preparar execução em produção com Evolution Community self-hosted.

### Avaliar / provisionar somente o necessário

* Docker / Docker Compose
* Evolution API Community
* PostgreSQL (se exigido pela versão Community escolhida)
* Redis (se exigido)
* armazenamento persistente (sessões/auth)
* backup
* logs
* monitoramento
* restart automático
* health checks

### Regras

* **NÃO** instalar componentes desnecessários.
* **NÃO** provisionar Evolution como serviço comercial gerenciado.
* Reutilizar infraestrutura existente do PlanoAgenda sempre que possível.
* Documentar topologia (dev / test / prod).

### Entrega

* Compose/stack self-hosted
* Health checks
* Procedimento de restart/backup básico

### Critério de conclusão

Ambiente de teste (e depois prod) sobe de forma reproduzível.

**Aguardar autorização para a Fase 18.**

---

# FASE 18 — SEGURANÇA

### Objetivo

Blindar credenciais, webhooks e isolamento multi-tenant.

### Nunca

* expor API key no frontend
* expor credenciais da Evolution
* armazenar secrets em código
* colocar tokens no Git
* permitir acesso público não autenticado à administração da Evolution

### Utilizar

* environment variables / secrets
* autenticação
* autorização por empresa
* isolamento multi-tenant
* validação de webhooks

### Entrega

* Checklist de segurança verificado
* Secrets apenas em cofre/env do ambiente

### Critério de conclusão

Nenhum secret no frontend/Git; webhooks autenticados; acesso Evolution restrito.

**Aguardar autorização para a Fase 19.**

---

# FASE 19 — LICENCIAMENTO

### Objetivo

Registrar obrigações da Evolution Community antes de produção.

### Verificar e documentar

* versão/tag exata da Evolution Community utilizada
* licença vigente da Community
* requisitos de atribuição/notificação
* confirmação de que **não** foi contratado plano comercial nesta etapa

### Regra

**NÃO** assumir que “open source = sem nenhuma obrigação”.

### Entrega

* Seção de licenciamento no repositório (ex.: em `WHATSAPP_ARCHITECTURE.md` ou arquivo dedicado)
* Versão pinada e condições aplicáveis

### Critério de conclusão

Documento de licença revisado e aprovado pelo proprietário.

**Aguardar autorização para a Fase 20.**

---

# FASE 20 — CUSTOS

### Objetivo

Documentar custos reais do cenário Community self-hosted.

### Não assumir custo zero

Documentar:

* custo Evolution comercial = **R$ 0 nesta fase** (não contratado)
* custo de servidor/VPS
* custo de banco
* Redis (se houver)
* armazenamento
* monitoramento
* domínio/subdomínio
* custo futuro eventual de plano comercial (fora do escopo)
* custo futuro Meta Cloud API (fora do escopo)

### Entrega

Arquivo `WHATSAPP_COSTS.md` com estimativa para:

* 10 empresas
* 50 empresas
* 100 empresas
* 500 empresas
* 1.000 empresas

Cenário base: **Community self-hosted**.

### Critério de conclusão

Documento revisado pelo proprietário.

**Aguardar autorização para a Fase 21.**

---

# FASE 21 — DOCUMENTAÇÃO

### Objetivo

Deixar o módulo operável por outra pessoa da equipe.

### Criar

#### `WHATSAPP_ARCHITECTURE.md`

* arquitetura
* fluxo
* componentes
* Evolution API Community
* Baileys
* provider
* webhooks
* fila
* worker
* banco
* segurança
* reconexão
* retries
* troubleshooting
* decisão Community/self-hosted

#### `WHATSAPP_SETUP.md`

1. instalar Evolution Community
2. configurar variáveis
3. configurar banco
4. configurar Redis, se necessário
5. configurar webhook
6. criar instância
7. conectar QR Code
8. testar envio
9. verificar logs
10. alternar provider `external` / `evolution`

### Critério de conclusão

Docs suficientes para setup e operação sem depender de conhecimento tácito.

**Aguardar autorização para a Fase 22.**

---

# FASE 22 — PREPARAR PARA FUTURO

### Objetivo

Garantir extensibilidade sem acoplar regras de negócio à Evolution.

### Arquitetura deve permitir

```text
WhatsAppProvider
  → Evolution Community / Baileys
  → Meta Cloud API (futuro)
  → outro provider (futuro)
```

### Regras

* Não acoplar regras de lembrete/agradecimento à Evolution.
* Não hardcodar URLs/payloads da Evolution na camada de negócio.
* Documentar o contrato do provider para novos implementadores.

### Entrega

* Contrato do provider estável
* Nota de extensão futura (Meta Cloud API) sem implementação agora

### Critério de conclusão

Adicionar um terceiro provider no futuro não exige reescrever a fila/worker/regras.

---

## REGRAS DE DESENVOLVIMENTO

1. Não reescrever código que já funciona sem necessidade.
2. Não alterar regras de negócio existentes.
3. Não remover a API atual.
4. Não quebrar os agendamentos atuais.
5. Não quebrar o cron atual.
6. Não criar dois workers fazendo a mesma coisa.
7. Não duplicar mensagens.
8. Não expor secrets.
9. Não implementar funcionalidades de WhatsApp além do escopo.
10. Preferir reutilização da infraestrutura existente.
11. Fazer alterações pequenas e testáveis.
12. Após cada fase, validar o funcionamento.
13. Se encontrar arquitetura existente melhor no projeto, adaptar a implementação em vez de impor arquitetura genérica.
14. Antes de executar migrations, apresentar o impacto.
15. Antes de remover qualquer código existente, justificar.
16. Não substituir a API atual até a validação final.
17. Usar apenas Evolution Community/self-hosted; sem plano comercial ou serviço gerenciado nesta etapa.
18. Comunicação e entregas de fase em português (pt-BR).

---

## REGRA FINAL DE EXECUÇÃO

1. Começar **somente** pela **FASE 1**.
2. Apresentar o relatório de auditoria.
3. **Aguardar autorização** para a Fase 2.
4. Repetir o ciclo fase a fase.

### Conteúdo mínimo do relatório da Fase 1

* como funciona hoje
* arquivos envolvidos
* tabelas
* cron
* worker
* API atual
* fluxo das três mensagens
* fluxo do agradecimento
* pontos de integração
* possíveis conflitos
* proposta de implementação (com Evolution Community/self-hosted)

**NÃO alterar código na Fase 1.**

---

## CHECKLIST RÁPIDO ANTES DE QUALQUER FASE QUE TOQUE NO SCHEDULER

- [ ] Problema alvo descrito claramente?
- [ ] Mudança afeta agendamento automático?
- [ ] Risco de duplicidade mapeado?
- [ ] Risco de atraso mapeado?
- [ ] Plano de rollback definido?
- [ ] Teste de produção/validação definido?
- [ ] Aprovação explícita do proprietário registrada?
- [ ] Continua havendo uma única fonte de scheduler?

Se qualquer item for “não”, **parar**.
