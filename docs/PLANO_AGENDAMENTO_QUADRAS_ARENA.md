# Plano: agendamento em quadras / arena (reuso do motor atual)

**Última atualização do documento:** 2026-04-15  
**Status geral da implementação:** em andamento — além do já listado até `20260425`, segue **Fase pagamentos arena**: credenciais MP por empresa (`20260426` + Edge `upsert-company-payment-credentials`), checkout no ato da reserva (`20260427` + Edge `create-court-booking-checkout`), extensão da Edge **`mercadopago-webhook`** para `courtbook:` (reserva pública), UI de credenciais só em **Config — modo arena** (`ConfigPage`), reserva pública **obrigatoriamente** via Mercado Pago (`20260428` + RPC `company_public_court_mercadopago_ready`), **retry checkout no cliente**, **cancelamento automático por timeout** com scheduler (`20260429`), **log operacional de execuções de timeout** (`20260430`) e card no **Admin Dashboard** via Edge `get-court-booking-timeout-runs` com filtro **24h / 7 dias** e alerta visual de erro. **Pendentes:** `plan_limits`, reembolso, QA rollout e homologação WhatsApp.

---

## Onde paramos (retomada rápida)

| Área | Situação |
|------|----------|
| Modelo de dados (Supabase) | **Parcial:** migration `20260412_phase1_courts_and_appointments_booking.sql` (`courts` + `appointments`) |
| Segmento × modo de agenda | **Feito:** migration `20260411_add_segment_types_scheduling_mode.sql` + `SegmentManagementPage` |
| Planos / features / menus | **Feito (parcial):** `20260419` (feature + `plan_features` + flag) + `20260422` (`menus` arena + `menu_plans` só em planos com `court_booking`); sidebar filtra `arena-*` por `canUseArenaManagement` (`MainApplication`) com fallback se o plano ainda não tiver vínculos |
| Dashboard proprietário (arena) | **Parcial:** `useCompanySchedulingMode`, painel arena em `/dashboard`, selo no header (`MainApplication`) |
| Horários + grade (Fase 2) | **Parcial:** migration `20260413_court_working_hours.sql`, `/quadras/horarios`, `/quadras/agenda`, utilitário `courtSlots.ts` |
| Preço por faixa de horário | **Feito:** migration `20260418_court_slot_price_bands.sql`, tela `/quadras/precos`, cálculo em RPCs `create_court_booking*` e `get_court_public_day_view` |
| Fluxo cliente (nova tela) | **Avançado:** rota `/reservar-quadra/:companyId` com **pagamento online obrigatório** (MP Checkout); sem credencial MP ativa a grade não abre |
| Edge functions / RLS | **Parcial:** RPCs públicas + `company_public_court_booking_allowed`; **pagamentos:** `upsert-company-payment-credentials`, `create-court-booking-checkout`, `mercadopago-webhook` (assinatura + arena); credenciais em tabela com RLS sem política JWT |

**Como pedir atualização:** solicite *“atualize o plano de quadras”* ou *“onde paramos no plano de quadras”* — a resposta deve citar este arquivo e a tabela acima, além de checklist com itens marcados quando houver progresso real.

---

## Checkpoint para retomada (salvo)

**Data deste checkpoint:** 2026-04-14 — retomar por aqui (“onde paramos” + o que falta).

### Fases já avançadas (não recomeçar daqui)

- **Base arena (dados + RLS autenticado):** `20260411`–`20260416`, quadras, placeholders, RPCs de reserva.
- **Cliente público (primeira versão):** `20260417`, rota `/reservar-quadra/:companyId`, preço por slot nas RPCs.
- **Preço por faixa:** `20260418`, `/quadras/precos`.
- **Produto / plano:** `20260419` — feature `court_booking`, flag `court_booking_enabled`, `plan_features`, sync de flags.
- **Lista reservas + performance:** `20260420` — índice lista; front com janela máxima, paginação e clamp de datas (`CourtReservationsListPage` + util).
- **Conflito + leitura pública `courts`:** `20260421` — índice parcial por quadra/dia (excl. cancelados) + RLS `anon` em `courts`.
- **Menus por plano (arena):** `20260422` — registros em `menus` / `menu_plans` para planos com `court_booking`; `MainApplication` filtra `arena-*` por `canUseArenaManagement` + fallback de sidebar.
- **Finalização libera slot + consistência de conflito:** `20260423` — `concluido` passa a não bloquear slot (UI + RPCs + índice parcial alinhado via `is_court_slot_blocking_status`).
- **UX mobile padronizada (arena):** header reutilizável `ArenaPageHeader` + ajustes de responsividade nas telas `Quadras`, `Horários`, `Agenda`, `Reservas`, `Preços por horário`.
- **WhatsApp x quadra (triggers/funções):** `20260424` — pipeline de mensagens ignora `booking_kind = court` em criação/finalização.
- **Fluxo público cliente (confirmação/pagamento inicial):** `20260425` — reserva pública de quadra passa a capturar `payment_method`, confirmação exibe resumo (empresa/quadra/data/valor/pagamento) e agenda pública trata edge cases de slot passado.
- **Fase pagamentos — credenciais (Fase 0):** migration `20260426_company_payment_credentials.sql`; Edge `upsert-company-payment-credentials` (status + upsert cifrado); secret `COMPANY_PAYMENT_CREDENTIALS_ENCRYPTION_KEY`; `ConfigPage` só em **modo arena** para colar access token MP.
- **Fase pagamentos — checkout + webhook:** `20260427_court_mercado_pago_checkout.sql` (colunas `mp_*` em `appointments`, `mercado_pago` em `payment_method`); Edge `create-court-booking-checkout` (preferência MP, `external_reference` `courtbook:{appointment_id}`); **`mercadopago-webhook`** estendida (ramo `courtbook:` + fallback token vendedor; assinaturas mantidas no fluxo com `external_reference` por underscore).
- **Regra produto link público:** `20260428_public_court_mercadopago_required.sql` — RPC `company_public_court_mercadopago_ready`; **`create_court_booking_public` obriga `mercado_pago`**, credencial ativa e valor ≥ R$ 0,50; front `PublicCourtBookingPage` sem dropdown “dinheiro/pix local”; só checkout MP.

### Próximas fases (checkpoint salvo para hoje à tarde)

1. **QA obrigatório:** retestar assinatura/planos (`mercadopago-webhook` legado) + reserva pública completa (sandbox/prod), incluindo falha + retry + timeout; checar logs das Edges.
2. **§6.6 — Cliente / operação (iniciar à tarde):** implementar política de cancelamento/reembolso e mensagens finais de UX.
3. **Hardening operacional:** alerta/rotina de suporte quando houver erro recorrente em `court-booking-payment-timeout-scheduler`.
4. **§5 item 4 — `plan_limits`** (ex.: máx. quadras / reservas mês), se couber nesta entrega.
4. **§6.7 — Rollout:** ordem completa de migrations no deploy incluindo **`20260426` → `20260427` → `20260428` → `20260429` → `20260430`**; empresa teste `court` + regressão `service`.
5. **§6.2 — Dados:** seed segmento arena; opcional flag “permitir reserva pública sem MP” se produto voltar atrás na regra obrigatória.
6. **§6.1 — Homologação WhatsApp** end-to-end em teste.

### Checkpoint salvo — arquitetura da fase de pagamentos (implementado)

- **Credenciais:** `company_payment_credentials` + RLS sem política para JWT; cifrado AES-GCM com chave mestra `COMPANY_PAYMENT_CREDENTIALS_ENCRYPTION_KEY` nas Edges.
- **Checkout:** `create-court-booking-checkout` usa access token da empresa; colunas `mp_preference_id` / `mp_payment_status` na reserva.
- **Webhook único:** `mercadopago-webhook` — `courtbook:` vs assinatura por formato de `external_reference`.
- **Link público:** sem credencial MP ativa a página não oferece grade; com credencial, fluxo só redireciona ao MP após criar agendamento `pendente`.
- **Admin Global:** monitoramento movido para rota dedicada `/admin-dashboard/court-booking-timeout-health`, mantendo `AdminDashboard` no padrão visual por cards.

### Lembrete operacional (migrations — ordem sugerida)

Incluir na sequência já existente: **`20260426` → `20260427` → `20260428` → `20260429` → `20260430`** (além de `20260420` … `20260425` se ainda não aplicadas).

**Edge Functions a manter deployadas:** `upsert-company-payment-credentials`, `create-court-booking-checkout`, `mercadopago-webhook`, `court-booking-payment-timeout-scheduler`, `get-court-booking-timeout-runs` (código com helpers de decifragem **inlinados** em `index.ts` — sem `../_shared/`).

---

## 1. Objetivo

Permitir que o mesmo produto atenda:

- **Agendamento de serviço** (barbearia, clínica, etc.): fluxo atual (colaborador + serviço + duração).
- **Agendamento de horário de quadra/arena** (beach, vôlei, tênis, etc.): novo fluxo com recurso físico (quadra), disponibilidade por slot e, no app do cliente, tela dedicada após escolher horários/quadras.

Reutilizar motor comum: calendário, conflitos, clientes, notificações, pagamentos (se existirem), assinatura por plano.

---

## 2. Decisão de produto: segmento vs “tipo de agenda”

**Recomendação:** não substituir o conceito de **segmento** (`segment_types`); **estendê-lo** com um **modo de agendamento** derivável do cadastro.

| Opção | Prós | Contras |
|-------|------|--------|
| A) Coluna em `segment_types` (ex.: `scheduling_mode`) | Simples; cadastro já escolhe segmento; admin cadastra “Arena / Esportes” com modo `court`. | Novos segmentos precisam ser classificados. |
| B) Coluna em `area_de_atuacao` | Poucos registros; padrão por “área”. | Menos granular se uma área tiver segmentos mistos. |
| C) Nova tabela `company_scheduling_profiles` | Máxima flexibilidade (híbrido no futuro). | Mais joins e UI. |

**Sugestão inicial:** **A** (`segment_types.scheduling_mode`), com valores `service` | `court`. Se no futuro existir empresa híbrida, evoluir para `hybrid` + C.

A empresa continua com `companies.segment_type` → join em `segment_types` define o dashboard e regras padrão.

---

## 3. Dashboard proprietário

- **Roteamento após login:** com base em `scheduling_mode` do segmento da empresa primária (ou flag explícita na empresa, se preferirem desnormalizar depois).
- **Modo `service`:** layout e menus atuais.
- **Modo `court`:** shell alternativo (ou mesmo shell com **menu set** diferente): apenas itens relevantes (quadras, disponibilidade, preços por horário, reservas, clientes se necessário, relatórios adaptados).
- **Implementação alinhada ao que já existe:** novos registros em `menus` + vínculos em `menu_plans` + `menu_role_permissions` (ver `COMO_FUNCIONA_MENUS_AUTOMATICOS.md`). Opcional: feature flag em `features` / `plan_features` + `company_flag_name` em `companies` (padrão já usado no projeto).

---

## 4. Experiência do cliente

- Manter fluxo atual para empresas `service`.
- Para `court`: após fluxo habitual de acesso à empresa, **nova rota/tela**: grade de **data → quadras disponíveis → horários livres** → confirmação (reutilizar criação de `appointments` com metadados de quadra).
- Convênio com agendamentos atuais: ver modelo SQL (`court_id`, `booking_kind`).

---

## 5. Planos e liberação de módulos

1. Criar **feature** (slug estável, ex.: `court_booking`) e, se desejado, `company_flag_name` apontando para coluna booleana em `companies` (ex.: `court_booking_enabled`) para sincronizar com `sync_company_flags_from_plan`.
2. Vincular em **`plan_features`** apenas nos planos que vendem o módulo arena.
3. Cadastrar **menus** do módulo arena e associar em **`menu_plans`** aos mesmos planos (e opcionalmente planos superiores).
4. **`plan_limits`:** novos `limit_type` opcionais, ex.: `courts`, `court_bookings_per_month` — alinhar com `useServiceLimit` / hooks similares.
5. Testar empresa **sem** o módulo: não ver menu arena; **com** módulo: menu e APIs liberados.

---

## 6. Checklist por alteração (controle)

Marque `[x]` conforme for concluindo no repositório / banco.

### 6.1 Banco de dados (Supabase)

- [x] Migration **Fase 1:** `20260412_phase1_courts_and_appointments_booking.sql` (`courts`, `booking_kind`, `court_id`, RLS autenticado).
- [x] Políticas **RLS** leitura pública (`anon`) em `courts` quando `company_public_court_booking_allowed` — migration `20260421_court_booking_conflict_index_and_anon_courts_read.sql` (fluxo ainda usa RPCs; leitura direta na tabela fica disponível).
- [x] Índices para conflito/lista em `appointments` (**parcial**): lista por empresa/período em `20260420_appointments_court_list_index.sql`; conflito por quadra/dia em `20260421`, ajustado em `20260423` para ignorar `cancelado` e `concluido`. **Pendente (opcional):** constraint `EXCLUDE` / `tstzrange` se quiser garantia no banco além da lógica nas RPCs.
- [x] Triggers / função de WhatsApp ajustados para `booking_kind = court` — migration `20260424_whatsapp_skip_court_bookings.sql` (criação/finalização de quadra não agenda mensagens). **Pendente:** homologação end-to-end em ambiente de teste.

**Nota salva (ocupação vs. finalização — 2026-04-13, atualizada):** o ajuste foi implementado em `20260423_court_release_slot_on_concluded.sql`: status **`concluido`** e `cancelado` **não bloqueiam** slot na agenda/conflito (UI + RPCs + índice parcial alinhados pela função `is_court_slot_blocking_status`). Próxima revisão de negócio: decidir se outros status “encerrados” também devem ser não-bloqueantes.

### 6.2 Segmentos e cadastro

- [x] Incluir coluna `scheduling_mode` em `segment_types` (migration `20260411_add_segment_types_scheduling_mode.sql`).
- [x] Ajustar **SegmentManagementPage** (admin): seleção do modo ao criar/editar segmento e exibição na lista.
- [ ] Dados: criar segmento(s) e/ou área “Esportes / Arena” com modo `court`.
- [ ] **CompanyRegistrationPage** / **UnifiedRegistrationPage** / edge `register-company-and-user`: nenhuma mudança obrigatória se segmento já carrega o modo; opcional: mensagem UX “Este segmento usa reserva de quadras”.

### 6.3 Planos, features, menus

- [x] Feature `court_booking` + coluna `companies.court_booking_enabled` + `sync_company_flags_from_plan` (migration `20260419_court_booking_plan_feature.sql`).
- [x] `plan_features`: vínculo automático da feature a **todos** os planos existentes na base no momento da migration (remover manualmente de planos que não devem ter arena, se necessário).
- [x] Menus arena via tabela `menus` / `menu_plans` — migration `20260422_arena_menus_plan_links.sql` (vínculo automático a planos que já têm feature `court_booking`); `MainApplication` mescla com `useMenuItems`, oculta `arena-*` sem módulo ativo na empresa e mantém **fallback** de injeção se nenhum item `arena-*` vier do plano.
- [ ] Atualizar documentação interna de flags (se existir checklist de deploy).

### 6.4 Backend / Edge

- [x] RPCs de reserva por quadra (`create_court_booking`, `create_court_booking_public`) com validação de conflito e **total_price** por soma de slots (`compute_court_booking_total_price`).
- [x] Preço por horário: tabela `court_slot_price_bands` + fallback `courts.default_slot_price` (iluminação / extras: futuro).
- [x] Pagamentos arena: `company_public_court_mercadopago_ready`; `create_court_booking_public` obrigatório MP (`20260428`); Edges `upsert-company-payment-credentials`, `create-court-booking-checkout`, extensão `mercadopago-webhook`; timeout automático com `court-booking-payment-timeout-scheduler` + cron (`20260429`); monitoramento de execução em `court_booking_payment_timeout_runs` (`20260430`); migrations `20260426`–`20260430`.

### 6.5 Frontend proprietário

- [x] Resolver `scheduling_mode` (hook `useCompanySchedulingMode` a partir da empresa primária).
- [x] **Dashboard** condicional em `/dashboard` (`ArenaDashboardPanel` quando `court`).
- [x] Menu lateral **Quadras** (`/quadras`) em modo `court` (proprietário/admin empresa ou colaborador).
- [x] **CRUD quadras** (`CourtsManagementPage`).
- [x] Layout / **menu condicional** via planos + feature: itens arena vêm de `menu_plans` quando o plano inclui `court_booking`; exibição condicionada a `canUseArenaManagement` (segmento `court` + `court_booking_enabled`).
- [x] Calendário de ocupação (grade do dia em `/quadras/agenda`, leitura + livre/ocupado + **dica de valor** alinhada às faixas).
- [x] Cadastro de **faixas de preço** (`/quadras/precos`).
- [x] Lista de reservas por quadra (`/quadras/reservas`, filtros + link para edição); criar reserva a partir do slot continua em `/quadras/agenda`.
- [x] `ConfigPage`: bloco Mercado Pago só em **modo arena** (`useCompanySchedulingMode`); demais empresas só banner + configurações gerais.

### 6.6 Frontend cliente

- [x] Rota pública `/reservar-quadra/:companyId` — grade, preço, reserva com **checkout Mercado Pago obrigatório** (`PublicCourtBookingPage` + `20260428`).
- [x] Confirmação pós-retorno MP (`GuestAppointmentConfirmationPage` com query `mp=1|0` + `paymentMethod=mercado_pago` nas `back_urls`).
- [x] Retry de checkout na confirmação pública quando retorno do MP falha (`mp=0`) — botão “Tentar pagar novamente”.
- [ ] Melhorias: mensagens refinadas de erro para sem MP/timeout e disponibilidade “por quadra” como rota dedicada (se produto pedir).
- [ ] Política cancelamento/reembolso e UX final (pós-pagamento / abandono de carrinho).

### 6.7 Testes e rollout

- [ ] Empresa teste `court` + plano com módulo.
- [ ] Empresa `service` sem regressão.
- [ ] Checklist de deploy (migrations ordem correta).

---

## 7. Análise crítica (escalabilidade / manutenção)

Centralizar o “modo” no **segmento** reduz duplicação e mantém uma única fonte de verdade no cadastro da empresa. Separar **menus por plano** reutiliza o mecanismo já documentado no projeto, evitando bifurcação ad-hoc de rotas. O principal custo é **modelar bem o recurso “quadra”** e **conflitos de horário** sem poluir `appointments`; as colunas `booking_kind` e `court_id` mantêm consultas simples e permitem evoluir para “híbrido” depois com pouca fricção.

**Próximos passos sugeridos:** validar triggers em `appointments` com `booking_kind = court`; `plan_limits` (ex.: máx. de quadras); integração cliente + pagamento; QA rollout. Após MVP, avaliar `court_availability_rules` (horários recorrentes) e constraint `EXCLUDE`/`tstzrange` se reservas forem tratadas como intervalos contínuos no banco.

---

## Apêndice A — SQL proposto (migration única lógica)

> **Atenção:** revisar nomes de constraints e políticas RLS já existentes no banco antes de aplicar. Ajustar UUIDs de `plan_id` / `menu_id` nos `INSERT` de seed (marcados com placeholders). O projeto usa `gen_random_uuid()` ou `uuid_generate_v4()` conforme migrações anteriores — manter o padrão já adotado.

O conteúdo SQL completo está na seção seguinte (copiável para `supabase/migrations/YYYYMMDD_court_booking_module.sql`).

```sql
-- =============================================================================
-- MÓDULO: Agendamento de quadras / arena (base + seeds genéricos)
-- Revisar placeholders <<<...>>> antes de rodar em produção.
-- =============================================================================

-- 1) Modo de agendamento no segmento (empresa herda via companies.segment_type)
ALTER TABLE public.segment_types
  ADD COLUMN IF NOT EXISTS scheduling_mode TEXT NOT NULL DEFAULT 'service'
    CHECK (scheduling_mode IN ('service', 'court'));

COMMENT ON COLUMN public.segment_types.scheduling_mode IS
  'service = agenda por colaborador/serviço; court = agenda por quadra/recurso físico.';

-- 2) Flag na empresa (opcional; sincronizável via plan_features.company_flag_name)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS court_booking_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.court_booking_enabled IS
  'Habilita funcionalidades de reserva de quadras quando true (e plano permitir).';

-- 3) Cadastro de quadras (recursos)
CREATE TABLE IF NOT EXISTS public.courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sport_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_courts_company_id ON public.courts(company_id);
CREATE INDEX IF NOT EXISTS idx_courts_company_active ON public.courts(company_id) WHERE is_active = true;

COMMENT ON TABLE public.courts IS 'Recursos físicos (quadras) para reserva por horário.';

-- 4) Extensão de appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_kind TEXT NOT NULL DEFAULT 'service'
    CHECK (booking_kind IN ('service', 'court'));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES public.courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_court_id ON public.appointments(court_id);
CREATE INDEX IF NOT EXISTS idx_appointments_booking_kind ON public.appointments(booking_kind);

COMMENT ON COLUMN public.appointments.booking_kind IS 'service = atendimento; court = uso de quadra.';
COMMENT ON COLUMN public.appointments.court_id IS 'Quadra reservada quando booking_kind = court.';

-- 5) Feature + vínculo a planos (exemplo: repetir para cada plano elegível)
-- Ajuste a lista de colunas de `features` ao schema real (created_at, etc.).
INSERT INTO public.features (id, slug, name, description, company_flag_name, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'court_booking',
  'Reserva de quadras',
  'Módulo de agendamento por quadra/arena.',
  'court_booking_enabled',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.features WHERE slug = 'court_booking');

-- Vincular feature a um plano (SUBSTITUIR pelo SELECT real de plan_id):
-- INSERT INTO public.plan_features (plan_id, feature_id)
-- SELECT '<<<PLANO_UUID>>>', id FROM public.features WHERE slug = 'court_booking'
-- ON CONFLICT DO NOTHING;

-- 6) Menus (exemplo mínimo — ajustar paths e labels ao frontend real)
-- INSERT INTO public.menus (id, menu_key, label, path, display_order, is_active, created_at, updated_at)
-- VALUES (
--   gen_random_uuid(),
--   'arena-quadras',
--   'Quadras',
--   '/arena/quadras',
--   10,
--   true,
--   now(),
--   now()
-- );
-- INSERT INTO public.menu_plans (plan_id, menu_id)
-- SELECT '<<<PLANO_UUID>>>', id FROM public.menus WHERE menu_key = 'arena-quadras';

-- 7) Limites opcionais por plano
-- INSERT INTO public.plan_limits (plan_id, limit_type, limit_value)
-- VALUES ('<<<PLANO_UUID>>>', 'courts', 5);

-- 8) RLS: habilitar e criar políticas em courts (exemplo genérico — adaptar ao padrão do repo)
-- ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY courts_select_members ON public.courts FOR SELECT ...;
-- CREATE POLICY courts_all_proprietario ON public.courts FOR ALL ...;
```

---

## Apêndice B — Referências no código

- Cadastro empresa / segmento: `src/pages/CompanyRegistrationPage.tsx`, `segment_types`.
- Menus por plano: `COMO_FUNCIONA_MENUS_AUTOMATICOS.md`, `src/hooks/useMenuItems.ts`.
- Features: `src/hooks/useHasFeature.ts`, `supabase/migrations/20250127_sync_company_flags_from_plan.sql`.
