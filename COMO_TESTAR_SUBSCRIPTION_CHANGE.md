# Como testar troca de plano

## Pré-requisitos

- Migrations aplicadas (`db push`).
- Functions deployadas:
  - `change-subscription-plan`
  - `subscription-change-scheduler`
  - `mercadopago-webhook`
  - `apply-coupon-and-subscribe`

## 1) Teste de upgrade/downgrade via Edge Function

No PowerShell:

```powershell
$env:SUPABASE_URL="https://ocawpokndruxakzmhzsa.supabase.co"
$env:SUPABASE_ANON_KEY="<anon_key>"
$env:SUPABASE_USER_ACCESS_TOKEN="<jwt_usuario_com_permissao>"
node .\scripts\test-subscription-change-flow.js <company_id> <target_plan_id> monthly
```

Resultados esperados:

- `changeType = "upgrade"` e `initPoint` presente (quando há cobrança).
- ou `changeType = "downgrade"` e `paymentRequired = false`.

## 2) Teste manual do scheduler

```powershell
$env:SUPABASE_URL="https://ocawpokndruxakzmhzsa.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
.\scripts\test-subscription-change-scheduler.ps1
```

Resultado esperado:

- JSON com `processed`, `applied` e `failed`.
- `failed` deve ser `0` no cenário nominal.

## 3) Validação SQL pós-execução

Abrir `TESTE_SUBSCRIPTION_CHANGE_FLOW.sql`, substituir `<COMPANY_ID>` e executar no SQL Editor.

Pontos de conferência:

- request em `subscription_change_requests` com status correto.
- `payment_attempts` vinculado nos upgrades pagos.
- assinatura (`company_subscriptions`) alinhada ao `to_plan_id` quando `status = applied`.
- ausência de `scheduled` vencidos por muito tempo.

## 4) Relatório de observabilidade

```powershell
$env:SUPABASE_URL="https://ocawpokndruxakzmhzsa.supabase.co"
$env:SUPABASE_ANON_KEY="<anon_key>"
$env:SUPABASE_USER_ACCESS_TOKEN="<jwt_usuario_com_acesso>"
.\scripts\test-subscription-change-report.ps1 -CompanyId "<company_id>" -Days 30
```

Pontos de conferência:

- `summary` por status no período.
- `recent_failures` com causa legível.
- `overdue_scheduled` vazio (ou próximo de zero).
- `recent_scheduler_runs` com `status = success` e sem erro recorrente.

## 5) Ações administrativas (reprocesso)

Pela UI em `Planos`, no card **Monitoramento de Troca de Plano**, use:

- `Reprocessar Falhas` para reenfileirar downgrades recuperáveis.
- `Executar Reconciliador Agora` para aplicar downgrades scheduled vencidos imediatamente.

Obs.: ações disponíveis apenas para usuários com permissão administrativa da empresa (ou admin global).

### Política de retry

- O reprocesso considera apenas falhas de `downgrade`.
- Existe limite padrão de tentativas por request (`maxRetries = 3`).
- Cada reprocesso incrementa `retry_count` e registra `last_retried_at`.
- Requests que extrapolam o limite não são reenfileiradas automaticamente.

## 6) Painel avançado de operação

- Acesse `Operações de Assinatura` no menu lateral.
- Use filtros por período/status para suporte.
- Exporte o histórico atual em CSV.
- Reprocessos e execução manual do reconciliador exigem **motivo obrigatório** (auditável).

