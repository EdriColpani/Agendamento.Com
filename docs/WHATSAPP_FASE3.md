# FASE 3 — Evolution API Community / self-hosted

**Data:** 25/08/2026  
**Status:** código + stack Docker prontos; validação operacional depende do ambiente  
**Default produção:** continua `WHATSAPP_PROVIDER=external` (Liot)

---

## Checklist (aprovado)

| Item | Resposta |
|------|----------|
| Problema alvo | Integrar Evolution Community self-hosted como backend do `EvolutionWhatsAppProvider` |
| Afeta agendamento automático? | Só quando `WHATSAPP_PROVIDER=evolution`; default external intacto |
| Risco de duplicidade | Não (mesmo worker/fila) |
| Risco de atraso | Não no caminho external |
| Rollback | `WHATSAPP_PROVIDER=external` + secrets Evolution opcionais |
| Teste | Health `fetchInstances` + create/connect + sendText em ambiente de teste |
| Aprovação | Sim |
| Fonte única de scheduler | Mantida |
| Plano comercial Evolution | **Não** — só Community self-hosted |

---

## Entregas

### 1) Stack Docker Community

Pasta: `infra/evolution/`

* `docker-compose.yml` — API **pinada** em `evoapicloud/evolution-api:v2.3.7`
* PostgreSQL 15 + Redis 7
* Manager UI opcional (`--profile manager`)
* `.env.example` (sem secrets no Git)

### 2) Provider real

Em `supabase/functions/whatsapp-message-scheduler/index.ts`:

* `EvolutionWhatsAppProvider` com:
  * `healthCheck()` → `GET /instance/fetchInstances`
  * `connect` → `POST /instance/create` (Baileys) + fallback connect
  * `disconnect` → `DELETE /instance/logout/{instance}`
  * `getQRCode` → `GET /instance/connect/{instance}`
  * `getInstanceStatus` → `GET /instance/connectionState/{instance}`
  * `sendTextMessage` → `POST /message/sendText/{instance}` (somente texto)
* Nome de instância provisório: `{EVOLUTION_INSTANCE_PREFIX}-{companyIdSanitizado}` (Fase 4 criará tabela dedicada)
* Não envia se status ≠ `CONNECTED`

### 3) Licença / versão

Ver `docs/WHATSAPP_EVOLUTION_LICENSE.md`  
Setup: `docs/WHATSAPP_SETUP_EVOLUTION.md`

---

## Secrets da Edge Function (teste)

```text
WHATSAPP_PROVIDER=external          # manter em prod até validar
EVOLUTION_API_URL=https://seu-host-evolution
EVOLUTION_API_KEY=<mesmo AUTHENTICATION_API_KEY do .env Evolution>
EVOLUTION_INSTANCE_PREFIX=planoagenda
```

**Importante:** a Edge Function no Supabase **não** acessa `localhost`. A Evolution precisa de URL HTTPS alcançável (VPS/tunnel) para o provider na nuvem.

---

## Como subir localmente

```bash
cd infra/evolution
cp .env.example .env
# editar AUTHENTICATION_API_KEY e POSTGRES_PASSWORD
docker compose --env-file .env up -d
# Manager opcional:
docker compose --env-file .env --profile manager up -d
```

Health manual:

```bash
curl -s http://127.0.0.1:8080/instance/fetchInstances \
  -H "apikey: SUA_CHAVE"
```

---

## Limitações documentadas (Community)

* Instância por empresa ainda é naming provisório (sem tabela `whatsapp_instances` — Fase 4).
* Sem UI de QR no PlanoAgenda ainda (Fase 5).
* Sem webhooks no PlanoAgenda ainda (Fase 6).
* Recursos só de plano comercial: **não usados**.
* Baileys/WhatsApp Web: risco de desconexão/ban — monitorar.

---

## Critério de conclusão

- [x] Compose Community self-hosted no repo (tag `v2.3.7`)
- [x] Secrets só via env
- [x] Provider fala com a API (health/auth/send)
- [x] Licença/versão documentadas
- [ ] Stack sobe no ambiente do proprietário
- [ ] `fetchInstances` com API key OK
- [ ] Deploy da Edge Function atualizada

**Não** ativar `WHATSAPP_PROVIDER=evolution` em produção até validar health + 1 envio de teste.

**Aguardar autorização para a Fase 4** (instâncias por empresa no banco).
