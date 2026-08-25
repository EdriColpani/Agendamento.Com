# FASE 2 — WhatsAppProvider (abstração de transporte)

**Data:** 25/08/2026  
**Status:** implementada no código (aguardando deploy manual da Edge Function)  
**Default de produção:** `WHATSAPP_PROVIDER=external` (LiotPRO)

---

## Checklist (aprovado)

| Item | Resposta |
|------|----------|
| Problema alvo | Desacoplar o envio HTTP do worker via `WhatsAppProvider` |
| Afeta agendamento automático? | Apenas o ponto de transporte; fila/cron/triggers intactos |
| Risco de duplicidade | Não |
| Risco de atraso | Não esperado |
| Rollback | Manter/secret `WHATSAPP_PROVIDER=external` ou reverter `index.ts` |
| Teste | Deploy + 1 mensagem real via Liot |
| Aprovação | Sim (autorização explícita Fase 2) |
| Fonte única de scheduler | Mantida (cron-job.org) |

---

## O que foi feito

Arquivo: `supabase/functions/whatsapp-message-scheduler/index.ts`

1. Interface `WhatsAppProvider` com:
   - `connect` / `disconnect`
   - `getConnectionStatus` / `getQRCode` / `getInstanceStatus`
   - `sendTextMessage`
2. `ExternalWhatsAppProvider` — encapsula o envio HTTP atual (LiotPRO).
3. `EvolutionWhatsAppProvider` — **stub** (retorna 501 até Fase 3).
4. Factory `createWhatsAppProvider()` lendo `WHATSAPP_PROVIDER`.
5. Worker chama apenas `whatsAppTransport.sendTextMessage(...)`.
6. `provider_response` passa a incluir `transport: 'external' | 'evolution'`.

**Não alterado:** fila, triggers SQL, regras de lembrete/agradecimento, cron, segundo scheduler.

---

## Configuração

Secret da Edge Function (opcional; default já é external):

```text
WHATSAPP_PROVIDER=external
```

**Não** definir `evolution` em produção até a Fase 3 — o stub falha envios de propósito.

---

## Deploy (obrigatório)

O projeto usa deploy manual no painel Supabase.

1. Abrir `supabase/functions/whatsapp-message-scheduler/index.ts`
2. Copiar o arquivo inteiro
3. Colar em: Supabase Dashboard → Edge Functions → `whatsapp-message-scheduler` → Deploy  
   Ou usar: `node scripts/deploy-whatsapp-scheduler.js`
4. Confirmar secret `WHATSAPP_PROVIDER` ausente ou `=external`
5. Testar: criar agendamento curto / forçar worker e verificar `message_send_log` com `provider_response.transport = "external"`

---

## Critério de conclusão

- [x] Interface criada
- [x] External encapsulado
- [x] Evolution stub
- [x] Worker usa abstração
- [ ] Deploy manual feito pelo proprietário
- [ ] Envio real validado via `external`

**Aguardar autorização para a Fase 3** (Evolution Community self-hosted).
