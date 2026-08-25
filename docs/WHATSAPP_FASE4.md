# FASE 4 — Gerenciamento de instâncias WhatsApp por empresa

**Data:** 25/08/2026  
**Status:** implementada (migration + Edge Function + provider integrado ao banco)

---

## Checklist

| Item | Resposta |
|------|----------|
| Problema alvo | Isolamento multi-tenant: 1 instância Evolution por empresa |
| Afeta scheduler? | Só quando `WHATSAPP_PROVIDER=evolution` (lê `whatsapp_instances`) |
| Risco de duplicidade | Não |
| Risco de atraso | Não no caminho `external` |
| Rollback | Reverter migration; manter `external` |
| Aprovação | Sim |

---

## Impacto da migration

**Arquivo:** `supabase/migrations/20260825193000_whatsapp_instances_fase4.sql`

| Item | Detalhe |
|------|---------|
| Nova tabela | `whatsapp_instances` |
| UNIQUE | `company_id`, `instance_name` |
| Sem secrets | API key só na Edge Function / env |
| RLS | SELECT para membros da empresa |
| Escrita | RPC `ensure_*` + Edge Function (service_role) |

**Não altera:** fila, triggers, cron, Liot (`external`).

---

## Modelo `whatsapp_instances`

| Campo | Descrição |
|-------|-----------|
| `company_id` | Empresa (UNIQUE) |
| `instance_name` | Nome na Evolution (`pa-<uuid>`) |
| `provider` | `evolution` |
| `status` | CONNECTING / CONNECTED / DISCONNECTED / ERROR |
| `connected_phone` | Número quando conectado |
| `connected_at` | Primeira conexão |
| `last_activity_at` | Última atividade |
| `last_disconnected_at` | Última desconexão |
| `last_error` | Erro operacional |

---

## RPCs

| Função | Quem usa |
|--------|----------|
| `ensure_whatsapp_instance(company_id)` | Proprietário/Admin ou service_role |
| `get_whatsapp_instance(company_id)` | Membros da empresa ou service_role |
| `update_whatsapp_instance_status(...)` | **Somente service_role** (Edge Functions) |

---

## Edge Function nova

**Nome:** `whatsapp-evolution-instance`  
**Auth:** JWT do usuário + validação Proprietário/Admin  
**Secrets:** `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (mesmos do scheduler)

### Body POST

```json
{
  "action": "ensure | get | connect | disconnect | sync_status | get_qr",
  "company_id": "uuid-da-empresa"
}
```

### Respostas úteis

* `connect` / `get_qr` → `{ qr, pairingCode, instance_name, status: CONNECTING }`
* `sync_status` → atualiza DB a partir da Evolution
* `disconnect` → logout na Evolution + status DISCONNECTED

---

## Provider (scheduler)

`EvolutionWhatsAppProvider` agora:

1. Lê `whatsapp_instances` por `company_id`
2. Só envia se `status = CONNECTED`
3. Usa `instance_name` do banco (não mais naming provisório)

---

## Como aplicar

### 1. Migration (Supabase SQL Editor)

Executar conteúdo de:

`supabase/migrations/20260825193000_whatsapp_instances_fase4.sql`

### 2. Deploy Edge Functions (painel Supabase)

* `whatsapp-evolution-instance` (novo)
* `whatsapp-message-scheduler` (atualizado)

Secrets necessários:

```text
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
WHATSAPP_PROVIDER=external
```

### 3. Teste manual (PowerShell / app)

Após login como Proprietário, chamar a Edge Function:

```powershell
# Exemplo conceitual — use o JWT da sessão do app
$body = '{"action":"ensure","company_id":"UUID_EMPRESA"}' 
# POST .../functions/v1/whatsapp-evolution-instance
```

Depois `connect` ou `get_qr`, escanear QR, `sync_status` até `CONNECTED`.

---

## Critério de conclusão

- [x] Tabela + RLS + RPCs
- [x] Edge Function backend CRUD/conexão
- [x] Provider usa instância do banco
- [ ] Migration aplicada no Supabase
- [ ] Edge Functions deployadas
- [ ] Teste Empresa A ≠ Empresa B (instance_name distintos)

**Próxima fase:** Fase 5 — UI QR em Configurações → WhatsApp
