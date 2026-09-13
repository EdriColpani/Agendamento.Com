# Plano de ação — 15 dias de teste grátis

**Objetivo:** permitir cadastro e uso do PlanoAgenda por **15 dias sem cobrança**, com conversão automática ou bloqueio ao fim do período.  
**Preços dos planos:** permanecem iguais até migração Liot → servidor próprio (sem alteração de tabela de preços nesta fase).

---

## Resumo executivo

| Item | Decisão proposta |
|------|------------------|
| Duração | 15 dias corridos a partir da ativação |
| Cartão no cadastro | **Não exigir** no trial (reduz fricção vs concorrentes) |
| Plano no trial | Premium ou plano escolhido na landing (com todos os módulos desse plano) |
| Após 15 dias | Bloquear mutações + banner para assinar; manter leitura básica opcional |
| WhatsApp | Continua via Liot durante trial (sem mudar provider) |

---

## Fase 1 — Modelo de dados (1–2 dias) ✅ **Concluída em 28/08/2026**

**Migration:** `supabase/migrations/20260828120000_subscription_trial_phase1.sql` (aplicada em produção)

| Entrega | Status |
|---------|--------|
| Colunas `is_trial`, `trial_started_at`, `trial_ends_at` em `company_subscriptions` | ✅ |
| Coluna `trial_used_at` em `companies` (anti-abuso) | ✅ |
| `app_config`: `trial_enabled=false`, `trial_days_default=15` | ✅ |
| RPC `get_trial_settings()` | ✅ |
| RPC `get_company_subscription_access(company_id)` | ✅ |
| `company_has_valid_subscription()` aceita `status=trial` ativo | ✅ |
| Índice `idx_company_subscriptions_trial_expiry` (prep Fase 4) | ✅ |

**Comportamento atual:** nenhum cadastro inicia trial ainda (`trial_enabled=false`). Assinaturas pagas existentes não são afetadas.

### 1.1 Migration `company_subscriptions`

Adicionar campos (ou usar status existente):

```sql
-- Opção A (recomendada): status 'trial' + datas
ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

-- CHECK status inclui 'trial' se ainda não existir
```

| Campo | Uso |
|-------|-----|
| `is_trial` | true durante os 15 dias |
| `trial_ends_at` | now() + 15 days na criação |
| `status` | `trial` → `active` (pago) ou `expired` |

### 1.2 Tabela de config (opcional)

`app_config` ou flag em `subscription_plans`:

- `trial_days_default = 15`
- `trial_enabled = true`

Permite ligar/desligar trial sem deploy.

---

## Fase 2 — Fluxo de cadastro (2–3 dias) ✅ **Concluída em 28/08/2026**

**Migration:** `supabase/migrations/20260828140000_subscription_trial_phase2.sql` (aplicada em produção)

| Entrega | Status |
|---------|--------|
| RPC `start_company_trial_subscription(company_id, plan_id)` | ✅ |
| `trial_enabled = true` em produção | ✅ |
| Edge Function `start-trial-subscription` | ✅ deploy v1 |
| `register-company-and-user` inicia trial com `planId` | ✅ deploy v30 |
| Landing: CTA “Teste grátis 15 dias” + badge sem cartão | ✅ |
| Cadastro: `?plan=&trial=1` sem Mercado Pago | ✅ |
| Hooks reconhecem assinatura `trial` | ✅ |

### 2.1 Landing + registro

1. CTA principal: **“Começar teste grátis de 15 dias”** (substituir ou complementar “Cadastrar empresa”).
2. `UnifiedRegistrationPage` → após criar empresa, **não** redirecionar para Mercado Pago imediatamente.
3. Criar assinatura `status = trial`, `trial_ends_at = now() + 15 days`, `plan_id` = plano escolhido.

### 2.2 Edge Function nova ou extensão

**`start-trial-subscription`** (ou ajuste em `register-company-and-user`):

- Input: `company_id`, `plan_id`
- Valida: empresa nova, sem assinatura ativa/paga anterior
- Cria `company_subscriptions` em trial
- Sincroniza flags/menus do plano (reutilizar lógica existente de `apply-coupon-and-subscribe` sem pagamento)

### 2.3 Regras anti-abuso

- 1 trial por `company_id` (UNIQUE ou flag `trial_used_at` na empresa)
- Opcional: 1 trial por CNPJ/e-mail proprietário
- Log de IP/device (fase posterior se necessário)

---

## Fase 3 — Enforcement no app (2 dias) ✅ **Concluída em 28/08/2026**

| Entrega | Status |
|---------|--------|
| Hook `useSubscriptionStatus` com `isTrial`, `planId`, `trialDaysRemaining` | ✅ |
| Banner `TrialBanner` (verde / amarelo ≤3 dias / vermelho último dia) | ✅ |
| Bloqueio pós-trial (`trial_expired`) com tela dedicada | ✅ |
| `/planos` destaca plano do trial + scroll automático | ✅ |
| RPC mutação já aceita trial via `company_has_valid_subscription` | ✅ (Fase 1) |

### 3.1 Middleware / hook central

`useSubscriptionAccess` ou extensão de `require_active_subscription`:

| Estado | Comportamento |
|--------|---------------|
| `trial` + dentro dos 15 dias | Acesso completo do plano |
| `trial` + expirado | Bloqueio de criar/editar; banner upgrade |
| `active` | Normal |
| `expired` / sem plano | Bloqueio |

### 3.2 RPC existente

Revisar `require_active_subscription_for_mutations` — incluir `status IN ('active', 'trial')` com `trial_ends_at > now()`.

### 3.3 UI

- Banner no topo: “Seu teste termina em X dias — [Assinar agora]”
- Últimos 3 dias: banner amarelo; último dia: vermelho
- Página `/assinatura` pré-selecionada com plano do trial

---

## Fase 4 — Expiração automática (1 dia) ✅ **Concluída em 28/08/2026**

| Entrega | Status |
|---------|--------|
| RPC `expire_due_trial_subscriptions(limit)` | ✅ |
| Tabelas `trial_expiration_scheduler_runs` + `trial_expiration_log` | ✅ |
| Edge Function `trial-expiration-scheduler` | ✅ deploy v1 |
| pg_cron `trial-expiration-scheduler-job` (diário 12:15 UTC) | ✅ |
| RPC `get_company_subscription_access` reconhece `expired` + `trial_ends_at` | ✅ |

### 4.1 Cron diário (Supabase pg_cron ou cron-job.org)

Job **`trial-expiration-scheduler`**:

1. `SELECT` assinaturas `is_trial = true AND trial_ends_at < now()`
2. Atualizar `status = 'expired'`, `is_trial = false`
3. Opcional: e-mail/WhatsApp “Seu teste acabou”

**Importante:** uma única fonte de cron (alinhado à regra WhatsApp — não duplicar schedulers).

### 4.2 Edge Function

`trial-expiration-scheduler/index.ts` — idempotente, logs em tabela de auditoria.

---

## Fase 5 — Conversão para pago (2–3 dias) ✅ **Concluída em 28/08/2026**

**Migration:** `supabase/migrations/20260828170000_trial_conversion_audit.sql` (aplicada em produção)

| Entrega | Status |
|---------|--------|
| Reutilizar linha do trial em `apply-coupon-and-subscribe` (sem INSERT duplicado) | ✅ |
| Trial → `pending` antes do checkout Mercado Pago | ✅ |
| Webhook converte trial/`pending` → `active` na mesma linha | ✅ |
| Limpa `is_trial`, `trial_started_at`, `trial_ends_at` ao confirmar pagamento | ✅ |
| Tabela `trial_conversion_log` + RPC `log_trial_conversion` | ✅ |
| Edge Functions deployadas (`apply-coupon-and-subscribe` v27, `mercadopago-webhook` v30) | ✅ |

**Módulo compartilhado (cópia colocal por deploy):** `trial-subscription-conversion.ts` em cada Edge Function.

### 5.1 Fluxo

1. Usuário clica “Assinar” → `SubscriptionPlansPage` com plano atual pré-selecionado
2. Reutilizar `apply-coupon-and-subscribe` + Mercado Pago
3. Ao confirmar pagamento:
   - `is_trial = false`
   - `status = 'active'`
   - `start_date` / `end_date` recalculados

### 5.2 Trial → pago antes dos 15 dias

- Permitir assinar a qualquer momento
- Trial encerra na confirmação do pagamento

---

## Fase 6 — Comunicação (1 dia) ✅ **Concluída em 28/08/2026**

**Migration:** `supabase/migrations/20260828180000_trial_reminder_scheduler.sql` (aplicada em produção)

| Momento | Canal | Status |
|---------|--------|--------|
| Dia 0 | E-mail boas-vindas + checklist (imediato no cadastro) | ✅ |
| Dia 7 | E-mail “metade do teste” | ✅ cron 09:30 BRT |
| Dia 12 | E-mail “3 dias restantes” (+ banner já na UI) | ✅ cron 09:30 BRT |
| Dia 15 | E-mail “teste encerrado” + link `/planos` | ✅ cron 09:30 BRT |

| Entrega | Status |
|---------|--------|
| Tabela `trial_reminder_log` (deduplicação) | ✅ |
| Edge Function `trial-reminder-scheduler` | ✅ deploy v1 |
| Boas-vindas em `register-company-and-user` e `start-trial-subscription` | ✅ |
| pg_cron `trial-reminder-scheduler-job` (12:30 UTC) | ✅ |

**Nota:** Dia 0 é enviado imediatamente no cadastro/início do trial; o scheduler cobre dias 7, 12 e 15.

---

## Fase 7 — Landing e marketing ✅ **Concluída em 28/08/2026**

| Entrega | Status |
|---------|--------|
| CTA principal “Começar teste grátis de X dias” | ✅ |
| Badge hero “Sem cartão · X dias grátis” | ✅ |
| Planos com preços visíveis + banner transparência trial | ✅ |
| FAQ dinâmico (`buildLandingFaq`) com trial ativo | ✅ |
| Seção “Como começar” alinhada ao fluxo trial | ✅ |
| CTA final antes do FAQ | ✅ |
| Cadastro (`UnifiedRegistrationPage`) com copy trial | ✅ (Fase 2) |

---

## Fase 8 — Métricas e validação ✅ **Concluída em 28/08/2026**

**Migration:** `supabase/migrations/20260828190000_trial_metrics_report_rpc.sql` (aplicada em produção)

| Métrica | Meta inicial | Fonte |
|---------|--------------|-------|
| Cadastros trial / período | Baseline + 30% | `trials_started` no RPC |
| Conversão trial → pago | > 15% | `trial_conversion_log` + taxa no RPC |
| WhatsApp configurado no trial | > 50% | `whatsapp_instances.status = CONNECTED` |
| Churn pós 1º mês pago | Monitorar | convertidos há 30+ dias sem assinatura ativa |

| Entrega | Status |
|---------|--------|
| RPC `get_trial_metrics_report(p_days)` (admin global) | ✅ |
| Página `/admin-dashboard/metricas-trial` | ✅ |
| Card no `AdminDashboard` | ✅ |
| KPIs, funil e-mail, conversões e expirados sem conversão | ✅ |
| Export CSV de conversões | ✅ |

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Abuso de trials múltiplos | 1 trial por empresa/CNPJ |
| Custo Liot no trial | Limitar msgs trial (opcional) ou plano Premium only |
| Usuário confuso cadastro vs login | Manter seção “Como começar” na landing |
| Cron duplicado | Usar pg_cron existente ou job único documentado |

---

## Checklist de go-live

- [x] Migration Fase 1 aplicada em produção
- [x] Migration + RPC Fase 2 aplicadas em produção
- [x] Edge Functions deployadas (`start-trial-subscription`, `register-company-and-user`)
- [x] RPC `company_has_valid_subscription` aceita `trial` ativo
- [ ] RPC de mutação — já coberta por `company_has_valid_subscription` (Fase 1)
- [x] Cron de expiração ativo (pg_cron diário)
- [x] Banner trial no app (Fase 3)
- [x] Bloqueio pós-trial na UI (Fase 3)
- [x] Landing com CTA trial + badge + FAQ + transparência de preços (Fase 7)
- [x] Edge Functions deployadas (`apply-coupon-and-subscribe`, `mercadopago-webhook` — conversão trial)
- [x] E-mails automáticos do trial (Fase 6)
- [x] Dashboard métricas trial (Fase 8)
- [ ] Teste E2E: cadastro → 15 dias simulados → bloqueio → pagamento → active
- [ ] Rollback: `trial_enabled = false` desliga novos trials sem afetar pagantes

---

## Próximo passo imediato

**Plano trial concluído (Fases 1–8).** Pendências operacionais: teste E2E manual e rollback documentado (`trial_enabled = false`).
