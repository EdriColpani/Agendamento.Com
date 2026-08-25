# Checkpoint — WhatsApp Evolution Community

**Salvo em:** 25/08/2026  
**Objetivo:** retomar o desenvolvimento sem perder o contexto.

---

## Status geral

| Fase | Status |
|------|--------|
| 1 — Auditoria | Concluída → `docs/WHATSAPP_FASE1_AUDITORIA.md` |
| 2 — WhatsAppProvider | Código pronto → `docs/WHATSAPP_FASE2.md` (deploy Edge Function pode estar pendente) |
| 3 — Evolution Community | Stack local + auth OK |
| 4 — Instâncias por empresa | Código pronto → `docs/WHATSAPP_FASE4.md` (aplicar migration + deploy) |
| 5+ | UI QR — **próxima fase** |

**Produção PlanoAgenda:** manter `WHATSAPP_PROVIDER=external` (Liot) até validação completa.

---

## O que já funciona localmente

* Docker Desktop instalado e ok
* Stack em `infra/evolution/`:
  * `evoapicloud/evolution-api:v2.3.7` (tag com **`v`**)
  * Postgres + Redis
  * Containers: `planoagenda_evolution_api`, `_postgres`, `_redis`
* Auth Evolution OK (`fetchInstances` sem 401)
* Instância de teste criada: **`planoagenda-teste`**
* Endpoint `connect` devolve QR em **base64** (PowerShell mostra texto; precisa salvar PNG para escanear)

---

## Arquivos importantes

| Arquivo | Uso |
|---------|-----|
| `docs/PLANO_WHATSAPP_EVOLUTION_COMMUNITY.md` | Plano completo (22 fases) |
| `docs/WHATSAPP_FASE1_AUDITORIA.md` | Auditoria sistema atual |
| `docs/WHATSAPP_FASE2.md` | Abstração provider |
| `docs/WHATSAPP_FASE3.md` | Evolution self-hosted |
| `docs/WHATSAPP_EVOLUTION_LICENSE.md` | Licença / versão |
| `docs/WHATSAPP_SETUP_EVOLUTION.md` | Setup Docker |
| `infra/evolution/docker-compose.yml` | Compose pinado `v2.3.7` |
| `infra/evolution/.env` | Secrets locais (**não commit**) |
| `supabase/functions/whatsapp-message-scheduler/index.ts` | Provider external + evolution |

---

## Como retomar (PowerShell)

```powershell
cd c:\V3\tipoagenda.com\infra\evolution

# Subir stack (se parado)
docker compose --env-file .env up -d

# Conferir
docker ps
docker logs planoagenda_evolution_api --tail 30

# Auth (chave vem do container)
$chave = (docker exec planoagenda_evolution_api printenv AUTHENTICATION_API_KEY).Trim()
Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/fetchInstances" -Headers @{ apikey = $chave } | ConvertTo-Json -Depth 5
```

### Gerar PNG do QR (instância de teste)

```powershell
cd c:\V3\tipoagenda.com\infra\evolution
$chave = (docker exec planoagenda_evolution_api printenv AUTHENTICATION_API_KEY).Trim()
$resp = Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/connect/planoagenda-teste" -Headers @{ apikey = $chave }
$b64 = $resp.base64
if (-not $b64) { $b64 = $resp.qrcode.base64 }
$b64 = $b64 -replace '^data:image/png;base64,', ''
$path = Join-Path (Get-Location) 'qrcode-planoagenda-teste.png'
[IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($b64))
Start-Process $path
```

Escaneie no WhatsApp → Aparelhos conectados.

### Manager UI (opcional)

```powershell
docker compose --env-file .env --profile manager up -d
# http://127.0.0.1:3000
```

---

## Pendências imediatas (ao voltar)

1. [ ] Abrir/escanear QR da instância `planoagenda-teste` (salvar PNG)
2. [ ] Confirmar `connectionState` = `open` / CONNECTED
3. [ ] Teste manual `sendText` para um número próprio
4. [ ] Redeploy Edge Function `whatsapp-message-scheduler` (código Fase 2/3 no painel Supabase)
5. [ ] **Não** setar `WHATSAPP_PROVIDER=evolution` em produção ainda  
   (Supabase não acessa `localhost`; precisa URL pública HTTPS depois)
6. [ ] Autorizar **Fase 4** — tabela/instâncias por empresa

---

## Regras que não esquecer

* Uma única fonte de scheduler (cron-job.org) — sem segundo cron
* Checklist + aprovação antes de alterar worker/cron WhatsApp
* Evolution = **Community self-hosted** (sem plano comercial nesta etapa)
* Secrets só em `.env` / Edge secrets — nunca no frontend/Git
* `AUTHENTICATION_API_KEY` da Evolution ≠ chave Supabase

---

## Frase para retomar no chat

> Continuar WhatsApp Evolution a partir do checkpoint em `docs/WHATSAPP_CHECKPOINT.md` — Fase 3 local OK, falta escanear QR e depois Fase 4.
