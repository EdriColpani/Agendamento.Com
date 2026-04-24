# Medidas de Segurança (checkpoint)

Data: 2026-04-23

## Objetivo

Registrar ações para reduzir exposição de token no frontend e endurecer a segurança das operações administrativas.

## Medidas priorizadas

1. Migrar áreas sensíveis para sessão via cookie `HttpOnly` + `Secure` + `SameSite` (modelo BFF/SSR).
2. Manter operações críticas apenas via Edge Functions com validação de role no backend.
3. Reduzir tempo de vida de JWT de usuário e revisar renovação de sessão.
4. Reforçar prevenção de XSS (CSP, sanitização, revisão de pontos de renderização dinâmica).
5. Garantir que nenhuma chave `service_role` seja usada no frontend.
6. Padronizar trilha de auditoria para ações administrativas críticas.

## Status da fase anterior (troca/migração de plano)

### Concluído

- Migrations de troca de plano criadas e já reconhecidas no ambiente remoto.
- Edge Functions de troca de plano deployadas:
  - `change-subscription-plan`
  - `subscription-change-scheduler`
  - `get-subscription-change-report`
  - `admin-subscription-change-actions`
- Funções relacionadas de billing/publicação atualizadas:
  - `apply-coupon-and-subscribe`
  - `mercadopago-webhook`
- Rota/admin dashboard ajustados para isolar operações em área de Admin Global.

### Pendente para fechamento da fase

1. Homologação funcional E2E com usuário real:
   - upgrade com proration;
   - downgrade agendado + aplicação por scheduler;
   - relatório operacional e ações admin.
2. Validação de segurança de acesso:
   - confirmar bloqueio 403 para não-admin global nas funções admin/report.
3. Evidências finais de aceite (resultado dos scripts SQL/PowerShell e checklist de regressão).

## Próxima execução sugerida

Após finalizar a homologação E2E acima, iniciar a fase de hardening de segurança listada neste documento.

## Checkpoint de retomada (fim do dia)

Data: 2026-04-23

- Correção aplicada no banco para função de bloqueio por assinatura (`assert_company_mutation_by_company_id`) no ambiente de teste.
- Validação de versão realizada com:
  - `select pg_get_functiondef('public.assert_company_mutation_by_company_id()'::regprocedure) like '%(empresa:%' as versao_antiga;`
  - resultado: `false` (função atualizada).
- Próxima ação combinada: executar testes funcionais no sistema durante a noite para validar fluxo completo de troca de plano.

### Itens para validar nos testes da noite

1. Upgrade de plano com cálculo de proration.
2. Downgrade agendado e aplicação por scheduler.
3. Relatório e ações em `Operações de Assinatura` no `AdminDashboard`.
4. Bloqueio de acesso para usuário não Global Admin (esperado: 403 nas funções administrativas).

---

## Checkpoint — retomada (salvo para amanhã)

**Data de referência:** 2026-04-23 (fim de sessão)

### O que já foi feito nesta rodada (admin / UX / esclarecimentos)

- **Arena — Cancelamentos e estornos** (`CourtBookingRefundHealthPage`): admin global sem empresa primária; seletor de empresa; `get-court-booking-refund-report` aceita admin global. Voltar → `/admin-dashboard`.
- **Operações de Assinatura** (`SubscriptionChangeOpsPage`): deixou de depender só de `primaryCompanyId`; lista de empresas + seletor; botão Voltar; texto explicando que a tela é de **trocas de plano** (`subscription_change_requests`), não adesão inicial.
- **Admin dashboard:** card **"Adesão e pagamentos de plano"** (ex-Tentativas de Pagamento) no grupo **Gerenciamento Principal**, ao lado de **Operações de Assinatura**; `PaymentAttemptsPage` com títulos alinhados.
- **Saúde Arena — Timeout de pagamento** (`CourtBookingTimeoutHealthPage`): aviso de que **cancelamento manual** não entra nesse painel; só **auto-cancel por job de timeout**; rótulo do resumo ajustado.

### Continuar amanhã (sugestão de ordem)

1. **Homologação E2E** ainda pendente: troca de plano (upgrade/downgrade, scheduler) + 403 fora de admin global, se ainda não validado.
2. Fase **medidas de segurança** (ver seção no topo deste arquivo), após fechar testes.
3. Dúvidas de produto: onde expor “visão agregada” (várias empresas) no relatório de estornos, se for requisito.

**Como retomar no chat:** *"continuar do checkpoint em `docs/MEDIDAS_DE_SEGURANCA.md`"* ou *"seguir homologação troca de plano"*.
