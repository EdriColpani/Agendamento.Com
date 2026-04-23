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
