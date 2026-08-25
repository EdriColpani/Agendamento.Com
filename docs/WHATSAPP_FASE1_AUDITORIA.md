# FASE 1 — AUDITORIA WHATSAPP (PlanoAgenda / TipoAgenda)

**Data:** 25/08/2026  
**Escopo:** somente análise — **nenhum código alterado**.  
**Referência:** `docs/PLANO_WHATSAPP_EVOLUTION_COMMUNITY.md`  
**Provider alvo futuro:** Evolution API Community / self-hosted (sem plano comercial).

---

## 1. Como funciona hoje (resumo)

```text
Criação do agendamento (serviço)
        │
        ▼
Trigger DB: handle_appointment_creation_whatsapp
        │
        ▼
RPC SQL: schedule_whatsapp_messages_for_appointment(..., 'APPOINTMENT_REMINDER')
        │
        ▼
Fila: message_send_log (status = PENDING, scheduled_for calculado)
        │
        ▼
Scheduler oficial: cron-job.org (a cada 1 min)
        │
        ▼
Edge Function: whatsapp-message-scheduler
        │
        ▼
sendViaProvider() → API externa HTTP (LiotPRO via messaging_providers)
        │
        ▼
message_send_log → SENT ou FAILED
```

Fluxos laterais:

* **Conclusão** (`status = concluido`) → trigger agenda `POST_SERVICE_THANKS`.
* **Cancelamento / desistência** → trigger marca `PENDING` como `CANCELLED`.
* **Quadra** (`booking_kind = 'court'`) → WhatsApp de serviço **ignorado**.

---

## 2. Arquitetura atual

| Camada | Papel |
|--------|--------|
| Frontend | Configura templates, regras, flag da empresa; admin global configura provedor HTTP |
| Banco (triggers + RPC) | Cria/cancela itens da fila na criação/conclusão/cancelamento |
| Fila `message_send_log` | Fonte da verdade do que enviar e quando |
| Edge Function worker | Processa `PENDING` vencidos e chama o provedor HTTP |
| cron-job.org | **Fonte única oficial** de disparo automático |
| GitHub Actions | Contingência **manual** (`workflow_dispatch`) |
| pg_cron | Histórico/fallback; **não** é a fonte oficial neste ambiente |

Não existe hoje abstração `WhatsAppProvider` nem Evolution/Baileys. O transporte é HTTP genérico acoplado a LiotPRO (`user_id`, `queue_id`, `payload_template`).

---

## 3. Arquivos envolvidos

### Backend / worker

* `supabase/functions/whatsapp-message-scheduler/index.ts` — worker + `sendViaProvider`
* `.github/workflows/whatsapp-message-scheduler.yml` — disparo manual

### SQL / triggers / regras (principais)

* `schedule_whatsapp_messages_for_appointment(uuid, text)` — versão consolidada em migrations (ex.: `20260624191000_...`)
* `handle_appointment_creation_whatsapp` + `trg_appointment_creation_whatsapp`
* `handle_appointment_completion_whatsapp` + `trg_appointment_completion_whatsapp`
* `handle_appointment_whatsapp_auto_cancel` + `trg_appointment_whatsapp_auto_cancel`
* Guardas de agradecimento (ex.: `guard_whatsapp_post_service_thanks_only_on_concluded`)
* RPCs auxiliares: `cancel_whatsapp_message`, `delete_whatsapp_messages_for_company`, `get_whatsapp_queue_health`, `get_whatsapp_cron_auth_token`

### Frontend

* `src/pages/WhatsAppMessagingPage.tsx` — `/mensagens-whatsapp` (toggle, templates, regras)
* `src/pages/WhatsAppMessageQueuePage.tsx` — `/mensagens-whatsapp/gerenciar-mensagens` (fila)
* `src/pages/WhatsAppProviderManagementPage.tsx` — `/admin-dashboard/whatsapp-providers` (provedor HTTP)
* `src/utils/checkWhatsAppMenuAccess.ts`
* Rotas em `src/App.tsx`; menu em `src/lib/dashboard-utils.tsx`

### Docs operacionais

* `docs/WHATSAPP_SCHEDULER_SINGLE_SOURCE.md`
* `docs/WHATSAPP_RUNBOOK_E_BLINDAGEM.md`
* `.cursor/rules/whatsapp-change-control.mdc`

### Criação de agendamento (origem do evento)

* Páginas/fluxos que inserem em `appointments` (ex.: `NovoAgendamentoPage`, forms de cliente, `book-appointment`, etc.)
* O frontend **não** precisa chamar a RPC: o **trigger de INSERT** agenda os lembretes.

---

## 4. Tabelas envolvidas

| Tabela | Função |
|--------|--------|
| `appointments` | Agendamentos (`appointment_date`, `appointment_time`, `status`, `client_id`, `company_id`, `booking_kind`) |
| `clients` | Cliente; telefone em `clients.phone` (dígitos; DDI 55 inferido no worker) |
| `companies` | Flag `whatsapp_messaging_enabled` |
| `message_kinds` | Tipos: `APPOINTMENT_REMINDER`, `POST_SERVICE_THANKS`, (também confirmation/cancellation no catálogo histórico) |
| `company_message_schedules` | Regras: offset + unidade + referência + canal WHATSAPP |
| `company_message_templates` | Texto com placeholders `[CLIENTE]`, `[EMPRESA]`, `[DATA_HORA]` |
| `messaging_providers` | Provedor HTTP atual (LiotPRO): `base_url`, `auth_*`, `payload_template`, `user_id`, `queue_id`, `company_id` |
| `message_send_log` | Fila/histórico: `scheduled_for`, `status`, `provider_response`, `processing_started_at` |
| `worker_execution_logs` | Telemetria de cada execução do worker |
| `app_config` | `service_role_key`, `whatsapp_cron_secret` (auth do cron) |

---

## 5. Funções / triggers envolvidos

| Item | Quando | Efeito |
|------|--------|--------|
| `handle_appointment_creation_whatsapp` | INSERT em `appointments` (serviço) | Agenda lembretes (`APPOINTMENT_REMINDER`; fallback sem filtro) |
| `handle_appointment_completion_whatsapp` | UPDATE status → `concluido` | Agenda só `POST_SERVICE_THANKS` |
| `handle_appointment_whatsapp_auto_cancel` | status → `cancelado` / `desistencia` | `PENDING` → `CANCELLED` |
| `schedule_whatsapp_messages_for_appointment` | chamada pelos triggers | Calcula `scheduled_for`, upsert lógico na fila |
| `whatsapp-message-scheduler` | cron a cada 1 min | Gera janela adicional de logs + envia `PENDING` vencidos |

---

## 6. Cron / worker

### Fonte única oficial (produção)

* **cron-job.org** → `POST` na Edge Function  
  URL: `.../functions/v1/whatsapp-message-scheduler`  
  Auth: `Authorization: Bearer <WHATSAPP_CRON_SECRET>`  
  Frequência: `*/1 * * * *`

### Contingência

* GitHub Actions: **somente manual** (`workflow_dispatch`)

### Não oficial / evitar paralelo

* `pg_cron` no banco migrado (intermitente) — não usar junto com cron-job.org

### Auth do worker

Aceita Bearer:

1. `WHATSAPP_CRON_SECRET` (secret da Edge Function), ou  
2. service role / valor em `app_config`

---

## 7. API atual (transporte)

* **Provedor:** LiotPRO (HTTP), configurado em `messaging_providers`
* **Envio:** `sendViaProvider()` monta payload a partir de `payload_template`, substitui `{phone}` / `{text}`, envia `fetch(base_url)`
* **Telefone:** E.164 BR no worker (`+55...`); na API Liot vai **sem `+`**
* **Erros conhecidos:** ex. `ERR_NO_WHATSAPP_CONNECTION` (sessão Liot inativa)
* **Webhooks da API atual:** **não há** endpoint WhatsApp/Liot no projeto

Não há QR Code no PlanoAgenda: a conexão WhatsApp fica no painel do LiotPRO.

---

## 8. Fluxo das três mensagens (lembretes)

1. Empresa habilita `whatsapp_messaging_enabled`.
2. Cadastra até N regras em `company_message_schedules` com kind `APPOINTMENT_REMINDER`.
3. Frontend grava offset **negativo** para lembretes (ex.: −24h, −2h, −30min) em relação a `APPOINTMENT_START`.
4. Na criação do agendamento, a RPC cria 1 linha `PENDING` por regra (dedupe por `appointment_id + message_kind_id + scheduled_for`).
5. Worker envia quando `scheduled_for <= now` (+ tolerância ~2 min).

**Observação:** o limite “máximo 3” é **configuração de negócio na UI/regras**, não um hard-cap rígido no SQL auditado; a migration recente **permite vários lembretes** do mesmo kind em horários diferentes.

---

## 9. Fluxo do agradecimento

1. Regra `POST_SERVICE_THANKS` ativa + template ativo.
2. Agendamento muda para `concluido`.
3. Trigger chama RPC com filtro `POST_SERVICE_THANKS`.
4. Blindagens impedem criar agradecimento na criação ou com status ≠ `concluido`.
5. `scheduled_for` usa referência `APPOINTMENT_COMPLETION` (= `NOW()` na RPC) + offset da regra.
6. Worker envia como qualquer outro `PENDING`.

---

## 10. Status da fila

| Status | Uso atual |
|--------|-----------|
| `PENDING` | Aguardando envio |
| `SENT` | Enviado com sucesso |
| `FAILED` | Falha de envio / validação |
| `CANCELLED` | Cancelado por status do agendamento ou ação manual |

**Não há** status `PROCESSING`/`SENDING` efetivo no worker atual (existe coluna `processing_started_at` por migration de lock, mas o loop de envio atual atualiza direto `PENDING` → `SENT`/`FAILED`).

---

## 11. Retries / idempotência

* **Retry automático de `FAILED`:** não há loop de reprocessamento no worker; `FAILED` permanece `FAILED`.
* **Reagendamento SQL:** ao recriar log, a RPC pode `DELETE` de `PENDING`/`CANCELLED`/`FAILED` no mesmo `scheduled_for` e reinserir `PENDING`.
* **Anti-duplicidade worker:** antes de inserir log na janela ±5 min, consulta se já existe log para appointment+kind+janela.
* **Risco residual:** worker ainda **gera** logs em janela temporal além dos criados no INSERT — caminho duplo (trigger + worker). Mitigado por checks, mas é ponto sensível.

---

## 12. Variáveis / secrets

| Onde | Chave | Uso |
|------|-------|-----|
| Edge Function secrets | `WHATSAPP_CRON_SECRET` | Auth do cron |
| Edge Function secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Cliente admin |
| `app_config` | `whatsapp_cron_secret`, `service_role_key` | Auth/fallback do cron |
| GitHub Secrets | `WHATSAPP_CRON_SECRET` | Workflow manual |
| `messaging_providers` | `auth_token`, `user_id`, `queue_id` | Credenciais Liot (banco; tela admin) |

**Frontend:** não deve expor secrets Evolution no futuro; hoje o admin global edita token do provedor na UI (padrão atual a preservar/melhorar).

---

## 13. Frontend já existente

* Toggle WhatsApp por empresa  
* CRUD templates e regras  
* Fila + saúde (`get_whatsapp_queue_health`)  
* Gestão de provedores HTTP (global)  
* **Não existe** tela de QR / status de sessão WhatsApp nativa

---

## 14. Logs / monitoramento

* `message_send_log.provider_response`  
* `worker_execution_logs`  
* Logs console da Edge Function (`=== whatsapp-message-scheduler INICIADO ===`, `sendViaProvider:`)  
* Flag `whatsapp_show_automation_panels` no admin  

---

## 15. Pontos que precisam ser preservados

1. Regras/templates por empresa e offsets negativos de lembrete.  
2. Trigger de criação (lembretes) e conclusão (agradecimento).  
3. Cancelamento automático de `PENDING`.  
4. Ignorar `booking_kind = court`.  
5. Fila `message_send_log` como fonte da verdade.  
6. **Uma única fonte de scheduler** (cron-job.org).  
7. Provider `external` (Liot) ativo até migração validada.  
8. Placeholders `[CLIENTE]`, `[EMPRESA]`, `[DATA_HORA]`.  
9. Timezone Brasília no cálculo de `scheduled_for`.  
10. Checklist/aprovação antes de tocar no worker/cron.

---

## 16. Riscos e conflitos para Evolution

| Risco | Detalhe |
|-------|---------|
| Caminho duplo de enfileiramento | Trigger SQL + geração no worker |
| Sem retry robusto | `FAILED` não reprocessa sozinho |
| Lock `processing_started_at` subutilizado | Concorrência se dois schedulers rodarem juntos |
| Reagendamento de data/hora | **Não há trigger** dedicado que recalcule a fila ao mudar `appointment_date`/`appointment_time` |
| Multi-tenant atual | Provedor HTTP por `company_id` (Liot user/queue), **não** sessão WhatsApp nativa por empresa |
| Secrets no admin UI | Token em `messaging_providers` editável no front admin |
| Segundo cron | Qualquer Evolution “scheduler” paralelo violaria a regra do projeto |
| Baileys/Community | Risco operacional de desconexão/ban; exige status CONNECTED antes de enviar |

---

## 17. Lacunas vs plano Evolution Community

| Capacidade do plano | Situação atual |
|---------------------|----------------|
| `WhatsAppProvider` | Não existe (só `sendViaProvider`) |
| Evolution Community self-hosted | Não existe |
| Instância WhatsApp por empresa + QR | Não existe |
| Webhooks de conexão/envio | Não existe |
| Switch `external` / `evolution` | Não existe (só um transporte HTTP) |
| Status CONNECTED/DISCONNECTED | Só indireto via erro Liot |
| Docs custos/licença Evolution | Não existem ainda |

O que **já cobre** grande parte do plano: fila, lembretes, agradecimento, cancelamento, worker, UI de regras, multiempresa parcial.

---

## 18. Proposta de implementação (próximas fases)

### Princípio

Trocar **somente o transporte**. Manter triggers, RPC, fila, templates, regras e cron único.

### Fase 2 (proposta)

1. Extrair interface `WhatsAppProvider` com `sendTextMessage` (+ stubs connect/QR/status).  
2. Implementar `ExternalWhatsAppProvider` movendo a lógica atual de `sendViaProvider` (Liot).  
3. Worker passa a chamar o provider configurado (`external` default).  
4. **Não** instalar Evolution ainda; **não** alterar cron; **não** mudar regras SQL.  
5. Checklist + aprovação antes de editar a Edge Function.

### Fase 3+

* Subir Evolution Community self-hosted (Docker).  
* `EvolutionWhatsAppProvider`.  
* Tabela `whatsapp_instances` por `company_id`.  
* UI QR.  
* Webhooks.  
* Switch por empresa.  
* Só então piloto `evolution` em 1 empresa.

### O que NÃO fazer

* Segundo worker/cron automático.  
* Reescrever `schedule_whatsapp_messages_for_appointment` sem necessidade.  
* Remover Liot antes da validação.  
* Plano comercial Evolution nesta etapa.

---

## 19. Critério de conclusão da Fase 1

* [x] Arquitetura atual mapeada  
* [x] Arquivos / tabelas / funções / cron / worker / API atual  
* [x] Fluxo 3 lembretes + agradecimento  
* [x] Riscos e pontos a preservar  
* [x] Proposta para Fase 2  

**Código:** nenhuma alteração nesta fase.

---

## 20. Aguardando autorização

Para iniciar a **Fase 2** (abstração `WhatsAppProvider` + encapsular API atual), é necessária **aprovação explícita** do proprietário, com checklist de impacto no scheduler (mesmo que a mudança seja só no ponto de transporte).
