# FASE 5 — Conexão WhatsApp por QR Code (UI)

**Data:** 25/08/2026  
**Status:** implementada (frontend)

---

## Checklist

| Item | Resposta |
|------|----------|
| Problema alvo | Permitir conectar/desconectar WhatsApp pela UI do PlanoAgenda |
| Afeta scheduler? | Não (apenas prepara instância; envio continua via cron existente) |
| Risco de duplicidade | Não |
| Risco de atraso | Não |
| Rollback | Remover aba/componente; instâncias no banco permanecem |
| Aprovação | Sim (Fase 5 autorizada pelo proprietário) |

---

## Arquivos criados/alterados

| Arquivo | Descrição |
|---------|-----------|
| `src/components/WhatsAppConnectionCard.tsx` | Card de conexão (QR, status, polling) |
| `src/utils/whatsappEvolutionApi.ts` | Cliente da Edge Function `whatsapp-evolution-instance` |
| `src/pages/WhatsAppMessagingPage.tsx` | Nova aba **Conexão** (padrão ao abrir a página) |

---

## Fluxo na UI

1. Usuário (Proprietário/Admin) abre **Mensagens WhatsApp** → aba **Conexão**.
2. Frontend chama `ensure` + `sync_status` para carregar estado.
3. **Conectar WhatsApp** → `get_qr` → exibe QR (base64) ou código de pareamento.
4. Polling a cada 3s com `sync_status` enquanto `CONNECTING`.
5. Ao detectar `CONNECTED`, exibe número e data; botão **Desconectar** chama `disconnect`.

Todas as chamadas passam pela Edge Function autenticada (JWT). Credenciais Evolution **não** vão ao browser.

---

## Pré-requisitos para teste

1. Migration Fase 4 aplicada no Supabase.
2. Edge Function `whatsapp-evolution-instance` deployada com secrets:
   - `EVOLUTION_API_URL`
   - `EVOLUTION_API_KEY`
3. Evolution API acessível pela Edge (URL pública HTTPS em produção).
4. Usuário logado como Proprietário ou Admin da empresa.

---

## Critério de conclusão

Empresa de teste conecta e desconecta com sucesso via UI (QR escaneado → status CONNECTED → disconnect).

---

## Próxima fase

**Fase 6** — Webhooks Evolution para atualização de status sem depender só de polling.
