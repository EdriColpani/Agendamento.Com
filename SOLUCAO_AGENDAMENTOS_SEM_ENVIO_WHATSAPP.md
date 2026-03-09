# Solução: agendamentos feitos mas mensagem WhatsApp não enviou

## O que o SQL mostrou

- **Seção 4 retornou "No rows"** → Não existe nenhuma mensagem em `message_send_log` com status PENDING e `scheduled_for` no passado.
- Ou seja: **para esses dois agendamentos os registros de envio nunca foram criados** (ou já foram processados — o mais provável é não terem sido criados).

Conclusão: o problema não é o cron nem a chave. O cron está rodando (seção 2 e 3 OK). O que falta é **ter linhas em `message_send_log`** para esses agendamentos. Isso é feito pela função SQL `schedule_whatsapp_messages_for_appointment` quando o agendamento é criado. Se ela não foi chamada ou falhou na hora da criação, não há nada para o scheduler enviar.

---

## Troca de token/usuário/fila no Liot

- **Pode ser causa de falha de envio** só **depois** que as mensagens existirem em `message_send_log`. Ou seja: token/usuário/fila errados no Liot fazem a Edge Function tentar enviar e a API Liot falhar (mensagem fica FAILED).
- **Não explica** “nenhuma linha na seção 4”: isso indica que os **logs de envio não foram criados** na criação do agendamento. A troca no Liot não impede a criação desses logs.
- Depois de criar os logs (passo abaixo), o envio usará o que está em **`messaging_providers`** (auth_token, user_id, queue_id). Confirme no banco ou na tela de configuração do provedor que token, user_id e queue_id estão atualizados.

---

## Solução 1: Criar os logs agora (agendamentos já existentes)

Execute no **Supabase → SQL Editor** para **gerar os registros de envio** para os dois agendamentos de teste (07/03/2026, “TESTE DE ENVIO MSG”):

```sql
-- 1) Ver os agendamentos do dia 07/03/2026 com a observação de teste
SELECT id, company_id, client_id, appointment_date, appointment_time, observations, status
FROM appointments
WHERE appointment_date = '2026-03-07'
  AND (observations ILIKE '%TESTE DE ENVIO%' OR observations IS NOT NULL)
ORDER BY appointment_time;

-- 2) Chamar a função de agendamento de mensagens para cada um
--    Use (uuid, NULL) para evitar erro "function is not unique" (existem 2 overloads no banco)
--    Substitua UUID_1 e UUID_2 pelos id retornados acima (um por linha)
SELECT public.schedule_whatsapp_messages_for_appointment('UUID_1'::uuid, NULL) AS resultado_1;
SELECT public.schedule_whatsapp_messages_for_appointment('UUID_2'::uuid, NULL) AS resultado_2;
```

- Rode primeiro o `SELECT` e anote os `id` dos dois agendamentos.
- Depois rode os dois `SELECT ... schedule_whatsapp_messages_for_appointment(...)` com esses UUIDs.
- Se a função retornar sucesso, as linhas em `message_send_log` serão criadas com `scheduled_for` conforme as regras (ex.: X minutos antes do horário). Se o horário de envio já tiver passado, na próxima execução do cron (a cada 2 min) a Edge Function vai pegar essas mensagens e tentar enviar (aí entram token/usuário/fila do Liot).

---

## Solução 2: Testar a Edge Function manualmente (PowerShell)

Isso **dispara a mesma lógica** que o cron (processar PENDING com `scheduled_for <= NOW()`). Serve para testar sem esperar o cron.

**1. Definir a Service Role Key (uma vez no PowerShell):**

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = 'sua-service-role-key-aqui'
```

*(Copie a chave em Supabase → Settings → API → service_role.)*

**2. Chamar a função:**

```powershell
cd c:\V3\tipoagenda.com
.\scripts\test-whatsapp-scheduler.ps1
```

- Se houver mensagens PENDING com `scheduled_for` no passado, a função vai tentar enviar e você verá a resposta no PowerShell.
- Se ainda não houver nenhum PENDING (porque você ainda não rodou o SQL da Solução 1), a resposta pode ser algo como “Nenhuma mensagem pendente” ou “Nenhuma empresa habilitada” — isso é esperado até existirem logs.

---

## Solução 3: Testar envio direto no Liot (provider)

Para validar **só** token/usuário/fila do Liot (sem passar pelo scheduler):

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = 'sua-service-role-key'
node scripts/test-whatsapp-provider.js +5546999151842 "Teste de envio apos trocar token e fila"
```

*(Troque o número se quiser.)*  
Esse script usa o provedor configurado no banco (`messaging_providers`). Se você atualizou token/usuário/fila no sistema, esse teste já usa essa configuração.

---

## Ordem recomendada

1. **Confirmar no banco** que token/user_id/queue_id do Liot estão corretos em `messaging_providers` (ou na tela de configuração do provedor).
2. **Rodar o SQL da Solução 1** para criar os logs dos dois agendamentos de 07/03.
3. **Rodar o script da Solução 2** (`test-whatsapp-scheduler.ps1`) para processar de imediato (ou esperar o cron).
4. Se o envio falhar, ver nos **logs da Edge Function** (Supabase → Edge Functions → whatsapp-message-scheduler → Logs) a mensagem de erro da API Liot (token inválido, fila errada, etc.).

Resumo: **trocar token/usuário/fila no Liot pode sim impedir o envio** quando já existem mensagens para enviar; no seu caso, primeiro faltavam os registros em `message_send_log` (por isso a seção 4 veio vazia). Criando os logs com o SQL e mantendo o Liot atualizado, o fluxo volta a funcionar.
