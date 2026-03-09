# Diagnóstico: mensagens WhatsApp não enviam nos horários

## Fluxo esperado (resumo)

1. **Criação do agendamento** (Novo Agendamento, Agendar, ou book-appointment): o sistema chama a função SQL `schedule_whatsapp_messages_for_appointment(appointment_id)`, que insere linhas na tabela `message_send_log` com `status = 'PENDING'` e `scheduled_for` = horário calculado (ex.: 10 min antes do agendamento).
2. **Cron (pg_cron)**: a cada 1 minuto (ou 2/5 min, conforme migração aplicada) o job chama a Edge Function `whatsapp-message-scheduler` via HTTP POST, enviando no header `Authorization: Bearer <service_role_key>`.
3. **Edge Function**: valida a chave, busca mensagens com `status = 'PENDING'` e `scheduled_for <= NOW()`, envia pelo provedor (LiotPRO) e atualiza o log para SENT/FAILED.

Se as mensagens **não estão sendo enviadas** nos horários, o problema está em algum desses elos.

---

## Causas mais prováveis (em ordem de verificação)

### 1. Chave do cron não configurada (403 na Edge Function)

O cron usa a função `get_service_role_key()`, que lê o valor da tabela **`app_config`** onde `key = 'service_role_key'`.  
Se essa linha **não existir ou estiver vazia**, o cron envia `Authorization: Bearer ` (sem chave) e a Edge Function responde **403 – Acesso negado**.

**Como verificar (SQL no Supabase → SQL Editor):**
```sql
SELECT key, CASE WHEN value = '' OR value IS NULL THEN '❌ VAZIO' ELSE '✅ CONFIGURADO (' || length(value) || ' chars)' END as status
FROM app_config WHERE key = 'service_role_key';
```
- Se não retornar nenhuma linha, ou status "VAZIO", **esta é a causa**: o cron não está autenticando.

**Como corrigir:**  
Inserir ou atualizar a Service Role Key do projeto (copiar em Supabase → Settings → API → `service_role` secret):
```sql
INSERT INTO app_config (key, value, description, updated_at)
VALUES ('service_role_key', 'SUA_SERVICE_ROLE_KEY_AQUI', 'Chave usada pelo cron para chamar whatsapp-message-scheduler', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

---

### 2. Cron job inativo ou inexistente

Se não houver job ativo chamando a Edge Function, ela nunca roda e nenhuma mensagem é processada.

**Como verificar:**
```sql
SELECT jobid, jobname, schedule, active,
       CASE WHEN active THEN '✅ ATIVO' ELSE '❌ INATIVO' END as status
FROM cron.job
WHERE jobname LIKE '%whatsapp%' OR command LIKE '%whatsapp-message-scheduler%';
```
- Nenhuma linha → job não existe (migração do worker não aplicada ou job removido).  
- `active = false` → job existe mas está desativado.

**Como corrigir:**  
Recriar o cron conforme a migração `20260215_worker_automatico_completo.sql` (job `whatsapp-message-scheduler-worker`, chamando a Edge Function com `get_service_role_key()` no header). Garantir que a extensão **pg_cron** (e **pg_net**, se usada) está habilitada no projeto.

---

### 3. Edge Function não recebendo chamadas ou retornando erro

Se o cron estiver correto mas a função falhar (403, 500, timeout), as mensagens não saem.

**Como verificar:**  
Supabase Dashboard → **Edge Functions** → **whatsapp-message-scheduler** → **Logs**.  
- Ver se há chamadas a cada minuto (ou conforme o schedule).  
- Se aparecer **403**: problema de chave (voltar ao item 1).  
- Se aparecer **500** ou erro no corpo: ler a mensagem de erro nos logs (ex.: “Nenhum provedor WHATSAPP ativo”, “Erro ao buscar empresas”, etc.).

Garantir também que a função tem os **Secrets** configurados: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (e qualquer outro que o código use, ex. LiotPRO).

---

### 4. Mensagens nunca criadas (RPC não chamada ou falha)

Se `schedule_whatsapp_messages_for_appointment` não for chamada ao criar o agendamento, ou falhar, não haverá linhas em `message_send_log` e não há o que enviar.

**Como verificar:**  
- No app: ao criar um agendamento, verificar no console do navegador se aparece log do tipo “Agendando mensagens WhatsApp…” e se não há erro após o `supabase.rpc('schedule_whatsapp_messages_for_appointment', …)`.  
- No banco, para um agendamento recente:
```sql
SELECT msl.id, msl.appointment_id, msl.scheduled_for, msl.status
FROM message_send_log msl
WHERE msl.appointment_id = 'UUID_DO_AGENDAMENTO';
```
- Se não houver linhas para agendamentos novos, a causa está na criação (front não chama a RPC, ou a RPC falha por empresa sem WhatsApp, sem provedor, etc.).

**Lembrar:** a RPC só agenda se a empresa tiver `whatsapp_messaging_enabled = true` e o plano tiver acesso ao menu “Mensagens WhatsApp”; caso contrário a própria aplicação pode não chamar a RPC ou a função pode sair sem inserir logs.

---

### 5. Empresa sem WhatsApp habilitado ou sem provedor

A Edge Function ignora empresas com `whatsapp_messaging_enabled = false`. E precisa de pelo menos um provedor ativo (`messaging_providers.channel = 'WHATSAPP'`, `is_active = true`) global ou por empresa.

**Como verificar:**
```sql
SELECT id, name, whatsapp_messaging_enabled FROM companies WHERE id = 'ID_DA_EMPRESA';
SELECT id, name, channel, is_active, company_id FROM messaging_providers WHERE channel = 'WHATSAPP';
```
- Empresa com `whatsapp_messaging_enabled = false` → habilitar na tela de Mensagens WhatsApp ou no banco.  
- Nenhum provedor ativo → configurar um em **Mensagens WhatsApp → Provedor** (ou tabela `messaging_providers`).

---

### 6. Regras de envio ou templates inativos

A função SQL que agenda as mensagens usa as regras em `company_message_schedules` (e templates em `company_message_templates`). Se não houver regra ativa para o tipo de mensagem (ex.: lembrete antes do agendamento), nenhum log é inserido para aquele tipo.

**Como verificar:**  
Usar o relatório completo em `VERIFICACAO_COMPLETA_ENVIO_MENSAGENS.sql` (seções de regras e templates).  
Ou:
```sql
SELECT cms.id, c.name, mk.code, cms.offset_value, cms.offset_unit, cms.is_active
FROM company_message_schedules cms
JOIN companies c ON c.id = cms.company_id
JOIN message_kinds mk ON mk.id = cms.message_kind_id
WHERE cms.channel = 'WHATSAPP' AND c.whatsapp_messaging_enabled = true;
```

---

### 7. Horário de envio (scheduled_for) vs. timezone

Os horários são calculados em Brasília e armazenados. A Edge Function compara `scheduled_for <= NOW()` em UTC. Se houver erro de timezone (ex.: `scheduled_for` salvo como texto/local sem conversão), mensagens podem nunca “estar no passado” e não serem enviadas.

**Como verificar:**  
Para mensagens que deveriam ter sido enviadas e continuam PENDING:
```sql
SELECT id, scheduled_for, scheduled_for AT TIME ZONE 'UTC' as scheduled_utc, status, NOW() as agora_utc
FROM message_send_log
WHERE status = 'PENDING'
ORDER BY scheduled_for DESC
LIMIT 10;
```
- Se `scheduled_utc` for **anterior** a `agora_utc` e mesmo assim não foram enviadas, o problema tende a ser cron/auth/Edge Function (itens 1–3).  
- Se `scheduled_utc` for sempre no futuro, o problema é no cálculo do `scheduled_for` (regras, offset, ou timezone na função que insere).

---

## Checklist rápido de ação

1. Rodar no **SQL Editor** o script **`VERIFICACAO_COMPLETA_ENVIO_MENSAGENS.sql`** (já existente no projeto) para ter o panorama de cron, empresas, provedores, regras e logs.  
2. Rodar o SELECT de **`app_config`** (item 1) e, se a chave estiver vazia/inexistente, inserir/atualizar a Service Role Key.  
3. Confirmar que o **cron** existe e está **active = true** (item 2).  
4. Abrir os **Logs** da Edge Function **whatsapp-message-scheduler** e ver se há execuções e com que status (item 3).  
5. Para um agendamento de teste: confirmar que existem linhas em **`message_send_log`** para esse appointment e que há PENDING com `scheduled_for` no passado (itens 4 e 7).

Com isso é possível identificar em qual elo a corrente está quebrada (chave do cron, cron inativo, Edge Function falhando, mensagens não criadas, empresa/provedor/regras, ou timezone).
