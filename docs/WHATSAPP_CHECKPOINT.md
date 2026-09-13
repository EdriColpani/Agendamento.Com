# Checkpoint — WhatsApp Evolution Community

**Salvo em:** 25/08/2026 (noite)  
**Objetivo:** retomar o desenvolvimento sem perder o contexto.

---

## Decisão atual (importante)

- **Produção PlanoAgenda:** continua `WHATSAPP_PROVIDER=external` (**Liot**). Não mudar.
- **Aba Conexão (Fase 5):** **oculta** no frontend (`SHOW_WHATSAPP_CONNECTION_TAB = false` em `WhatsAppMessagingPage.tsx`).
- **VPS:** pausado por custo. ngrok = só teste pontual.
- **Reativar UI:** setar flag `true` + deploy frontend quando infra Evolution estiver estável.

---

## Status geral

| Fase | Status |
|------|--------|
| 1 — Auditoria | ✅ `docs/WHATSAPP_FASE1_AUDITORIA.md` |
| 2 — WhatsAppProvider | ✅ Código + doc `docs/WHATSAPP_FASE2.md` |
| 3 — Evolution Community | ✅ Docker local OK `docs/WHATSAPP_FASE3.md` |
| 4 — Instâncias por empresa | ✅ Migration + Edge Function + doc `docs/WHATSAPP_FASE4.md` |
| 5 — UI QR (Conexão) | ✅ Frontend em produção + doc `docs/WHATSAPP_FASE5.md` |
| 6+ | Webhooks etc. — **não iniciado** |

**UI em produção:** `https://planoagenda.com.br/mensagens-whatsapp` → aba **Conexão**.

---

## O que já está feito

### Backend / banco
* Migration `whatsapp_instances` aplicada (tabela existe no projeto Agendamento)
* RPCs: `ensure_whatsapp_instance`, `get_whatsapp_instance`, `update_whatsapp_instance_status`
* Edge Function `whatsapp-evolution-instance` deployada (v5+) — CORS OK, timeout Evolution, try/catch
* Secrets necessários: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (URL **pública** HTTPS)

### Frontend
* `src/components/WhatsAppConnectionCard.tsx`
* `src/utils/whatsappEvolutionApi.ts`
* Aba **Conexão** em `WhatsAppMessagingPage.tsx`
* Merge PR #49 → `main`; deploy Vercel Production via commit `chore: trigger production deploy`

### Evolution local
* Stack `infra/evolution/` — imagem `evoapicloud/evolution-api:v2.3.7`
* Porta **127.0.0.1:8080** (Docker); atenção: Vite também usa 8080 em `0.0.0.0` — ngrok deve usar `127.0.0.1:8080`
* `.env` local com `AUTHENTICATION_API_KEY` (não commit)

### Teste ngrok (já feito nesta sessão)
* Túnel funcionou: Evolution responde via HTTPS ngrok
* Exemplo de URL usada: `https://kaylin-geostatic-interacademically.ngrok-free.dev` (muda se reiniciar ngrok)
* Erro em produção visto: `502` / `Falha ao conectar Evolution (0)` = Supabase **não alcança** localhost

---

## Arquivos importantes

| Arquivo | Uso |
|---------|-----|
| `docs/PLANO_WHATSAPP_EVOLUTION_COMMUNITY.md` | Plano completo |
| `docs/WHATSAPP_FASE1` … `FASE5.md` | Docs por fase |
| `docs/WHATSAPP_SETUP_EVOLUTION.md` | Setup Docker |
| `infra/evolution/docker-compose.yml` | Compose |
| `infra/evolution/.env` | Secrets locais (**não commit**) |
| `supabase/migrations/20260825193000_whatsapp_instances_fase4.sql` | Schema instâncias |
| `supabase/functions/whatsapp-evolution-instance/index.ts` | Edge QR/connect |
| `supabase/functions/whatsapp-message-scheduler/index.ts` | Provider external + evolution |
| `src/components/WhatsAppConnectionCard.tsx` | UI conexão |

---

## Como retomar (PowerShell)

### Subir Evolution local

```powershell
cd c:\V3\tipoagenda.com\infra\evolution
docker compose --env-file .env up -d
docker ps
```

### Túnel rápido (teste — PC ligado)

```powershell
# IMPORTANTE: usar 127.0.0.1 (Evolution), não só "8080" (conflito com Vite)
ngrok http 127.0.0.1:8080
```

Depois, no Supabase → Edge Function **`whatsapp-evolution-instance`** → Secrets:

| Secret | Valor |
|--------|--------|
| `EVOLUTION_API_URL` | URL HTTPS do ngrok (sem barra no final) |
| `EVOLUTION_API_KEY` | Mesmo `AUTHENTICATION_API_KEY` do `.env` Evolution |

Opcional no `.env` Evolution: `SERVER_URL=<mesma URL ngrok>` e recreate do container.

Teste: site → Mensagens WhatsApp → Conexão → Conectar WhatsApp.

### Produção 24h (quando aceitar custo)

* VPS Ubuntu + Docker + Caddy + subdomínio fixo (ex. `evolution.planoagenda.com.br`)
* Secrets Supabase **uma vez** com URL fixa
* PC **não** precisa ficar ligado

---

## Pendências ao voltar

1. [ ] Decidir caminho: Liot só / teste ngrok / VPS depois
2. [ ] Se testar: ngrok + secrets Supabase + QR na UI
3. [ ] **Não** setar `WHATSAPP_PROVIDER=evolution` em produção até CONNECTED estável
4. [ ] Fase 6 — webhooks (quando Evolution estiver estável online)
5. [ ] Redeploy `whatsapp-message-scheduler` se código local divergir do painel

---

## Regras que não esquecer

* Uma única fonte de scheduler (cron-job.org) — sem segundo cron
* Checklist + aprovação antes de alterar worker/cron WhatsApp
* Evolution = Community self-hosted (sem plano comercial nesta etapa)
* Secrets só em `.env` / Edge secrets — nunca no frontend/Git
* `AUTHENTICATION_API_KEY` da Evolution ≠ chave Supabase
* Edge Function **não** acessa `localhost`

---

## Frase para retomar no chat

> Continuar WhatsApp Evolution a partir de `docs/WHATSAPP_CHECKPOINT.md` — Fases 1–5 feitas (UI em prod); produção continua Liot; VPS pausado por custo; próximo = teste ngrok ou VPS quando decidir.
