# Contexto: envio WhatsApp pendente retorno do LiotPRO

**Data:** 07/03/2026 (ou quando você retomar)

---

## Onde paramos

- **Problema:** Mensagens WhatsApp não estão sendo enviadas. A Edge Function roda, processa os logs PENDING, mas ao chamar a API do LiotPRO a resposta é **404 Not Found** (body null).
- **URL usada:** `https://sistema.liotpro.online/api/messages/send` (POST, JSON com body, number, userId, queueId, etc.).
- **Confirmado no sistema:** Cron ativo, chave OK, logs criados, 1 provedor por empresa, token/usuário/fila cadastrados e conferidos. O ponto de falha é **a resposta 404 da API do LiotPRO**.
- **Ação feita:** Você perguntou ao LiotPRO qual o endpoint correto e o formato de requisição esperado. **Aguardando retorno deles.**

---

## Quando voltar

1. Abrir este arquivo para retomar o contexto.
2. Com a resposta do LiotPRO em mãos:
   - Se a **URL** for outra → atualizar `base_url` em `messaging_providers` (ou na tela de configuração do provedor).
   - Se o **formato do body/headers** for outro → ajustar o payload no script `scripts/test-whatsapp-provider.js` e na Edge Function `supabase/functions/whatsapp-message-scheduler/index.ts` (função `sendViaProvider` / montagem do body).
3. Rodar de novo o teste no PowerShell: `.\scripts\test-whatsapp-provider-completo.ps1 -Telefone "+55..." -Mensagem "Teste"` (com `SUPABASE_SERVICE_ROLE_KEY` definida).
4. Se o teste enviar, o cron passará a enviar normalmente nas próximas execuções.

---

## Arquivos relacionados

- `SOLUCAO_AGENDAMENTOS_SEM_ENVIO_WHATSAPP.md` – criar logs manualmente, testar scheduler.
- `VERIFICAR_WHATSAPP_RAPIDO.sql` – verificação rápida cron/chave/pendentes.
- `scripts/test-whatsapp-provider-completo.ps1` e `scripts/test-whatsapp-provider.js` – teste de envio direto ao provedor.
- Edge Function: `supabase/functions/whatsapp-message-scheduler/index.ts` – envia usando `provider.base_url` e payload do provedor.
