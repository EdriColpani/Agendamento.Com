# Setup — Evolution API Community (PlanoAgenda)

Ambiente **self-hosted**. Sem plano comercial.

## Pré-requisitos

* Docker + Docker Compose
* Porta livre `8080` (API) e opcionalmente `3000` (Manager)
* Chave forte: `openssl rand -hex 32`

## 1. Instalar

```bash
cd infra/evolution
cp .env.example .env
```

Edite `.env`:

* `AUTHENTICATION_API_KEY`
* `POSTGRES_PASSWORD` (e o mesmo valor em `DATABASE_CONNECTION_URI`)

```bash
docker compose --env-file .env up -d
```

Manager (opcional):

```bash
docker compose --env-file .env --profile manager up -d
```

## 2. Variáveis

Ver `infra/evolution/.env.example`.

Mínimo crítico:

* `AUTHENTICATION_API_KEY`
* `DATABASE_CONNECTION_URI` / Postgres
* `CACHE_REDIS_URI`

## 3. Banco / Redis

Provisionados pelo próprio `docker-compose.yml` (containers `evolution-postgres` e `evolution-redis`).

## 4. Webhook

Nesta fase: `WEBHOOK_GLOBAL_ENABLED=false`.  
Webhooks no PlanoAgenda = **Fase 6**.

## 5. Criar instância (manual / API)

```bash
curl -X POST http://127.0.0.1:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_CHAVE" \
  -d "{\"instanceName\":\"planoagenda-teste\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}"
```

## 6. Conectar QR Code

```bash
curl -s http://127.0.0.1:8080/instance/connect/planoagenda-teste \
  -H "apikey: SUA_CHAVE"
```

Use o `base64` do QR no WhatsApp → Aparelhos conectados.  
Ou abra o Manager em `http://127.0.0.1:3000` (se subiu com profile manager).

## 7. Testar envio

```bash
curl -X POST http://127.0.0.1:8080/message/sendText/planoagenda-teste \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_CHAVE" \
  -d "{\"number\":\"5549999999999\",\"text\":\"Teste PlanoAgenda Evolution Community\"}"
```

## 8. Logs

```bash
docker logs -f planoagenda_evolution_api
```

## 9. Ligar ao PlanoAgenda (Edge Function)

Secrets no Supabase (Edge Function `whatsapp-message-scheduler`):

| Secret | Valor |
|--------|--------|
| `EVOLUTION_API_URL` | URL **pública HTTPS** da Evolution (não localhost) |
| `EVOLUTION_API_KEY` | Mesmo `AUTHENTICATION_API_KEY` |
| `EVOLUTION_INSTANCE_PREFIX` | `planoagenda` (opcional) |
| `WHATSAPP_PROVIDER` | Manter `external` até validar; só então testar `evolution` em empresa piloto |

Redeploy da função após alterar o código (colar `index.ts` no painel).

## 10. Alternar provider

* Produção atual: `WHATSAPP_PROVIDER=external`
* Teste Evolution: `WHATSAPP_PROVIDER=evolution` **somente** com URL alcançável e instância `CONNECTED`

## Troubleshooting rápido

| Sintoma | Ação |
|---------|------|
| `fetchInstances` 401 | API key divergente |
| Edge não envia | URL localhost ou firewall; Evolution precisa ser pública para o Supabase |
| sendText 409 no provider | Instância não `CONNECTED` |
| Sessão perdida após restart | Conferir volume `evolution_instances` |
