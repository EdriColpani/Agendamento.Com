# Runbook WhatsApp - Operacao, Rotinas e Blindagem

## 1) Objetivo

Registrar de forma completa as rotinas de envio automatico de mensagens WhatsApp para:

- operar com previsibilidade;
- reduzir incidentes de atraso/duplicidade;
- evitar alteracoes sem aprovacao e checklist.

---

## 2) Componentes do fluxo completo

### 2.1 Edge Function (execucao do worker)

- Funcao: `supabase/functions/whatsapp-message-scheduler/index.ts`
- Papel:
  - buscar mensagens `PENDING` vencidas;
  - enviar via provedor WhatsApp ativo;
  - atualizar `message_send_log` para `SENT`/`FAILED`;
  - registrar telemetria em `worker_execution_logs`.

### 2.2 Banco (fila de mensagens)

- Tabela principal: `public.message_send_log`
- Status esperados:
  - `PENDING`
  - `SENT`
  - `FAILED`
  - `CANCELLED`

### 2.3 Scheduler externo oficial (fonte unica)

- Plataforma: **cron-job.org**
- Frequencia: `*/1 * * * *` (1 minuto)
- Chamada HTTP para Edge Function.

### 2.4 Workflow GitHub (rotina de contingencia manual)

- Arquivo: `.github/workflows/whatsapp-message-scheduler.yml`
- Estado atual: sem schedule automatico, apenas `workflow_dispatch`.
- Uso: disparo manual controlado (operacao assistida).

### 2.5 Job pg_cron no banco

- Nome historico: `whatsapp-message-scheduler-job`
- Estado recomendado neste ambiente migrado: **nao usar como fonte oficial** (instavel).
- Uso permitido: apenas diagnostico pontual ou ambiente que comprove estabilidade.

---

## 3) Rotina oficial em producao (ATUAL)

### 3.1 Scheduler oficial ativo

- **Somente cron-job.org**.

### 3.2 Scheduleres nao oficiais

- GitHub automatico: desativado.
- pg_cron do banco novo: nao confiavel neste ambiente.

### 3.3 Regra de ouro

- Nunca operar com dois scheduleres automaticos simultaneos.

---

## 4) Configuracao completa do cron-job.org

1. URL:
   - `https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler`
2. Metodo:
   - `POST`
3. Frequencia:
   - `*/1 * * * *` (cada 1 minuto)
4. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer <WHATSAPP_CRON_SECRET>`
5. Body:
   - `{"source":"external_cron","timestamp":"auto"}`
6. Timeout:
   - 30 segundos (ou maior)

---

## 5) Rotina GitHub (manual)

Arquivo:

- `.github/workflows/whatsapp-message-scheduler.yml`

Comportamento esperado:

- apenas `workflow_dispatch`;
- sem `schedule` automatico.

Uso:

- executar manualmente em contingencia quando solicitado.

---

## 6) Rotina pg_cron (referencia tecnica)

### 6.1 SQL de criacao do job (referencia)

```sql
SELECT net.http_post(
  url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || get_whatsapp_cron_auth_token()
  ),
  body := jsonb_build_object(
    'source', 'cron_worker',
    'timestamp', extract(epoch from now())::text
  ),
  timeout_milliseconds := 30000
) AS request_id;
```

### 6.2 Status no ambiente migrado

- Job pode aparecer `active=true`, mas sem `last run` real e sem entradas em `cron.job_run_details`.
- Em caso de ausencia de execucao recorrente, nao usar como scheduler oficial.

---

## 7) Validacao por minuto (operacao)

### 7.1 Check rapido

1. Criar agendamento de teste para os proximos minutos.
2. Aguardar 2 minutos apos horario previsto.
3. Confirmar:
   - fila saiu de `PENDING` para `SENT`;
   - mensagem chegou no WhatsApp.

### 7.2 Check tecnico

- `worker_execution_logs`: deve receber execucoes recentes.
- `message_send_log` com `PENDING` vencido: nao pode acumular continuamente.

---

## 8) Diagnostico de incidente

Quando mensagem nao sai no horario:

1. verificar ultima execucao no cron-job.org;
2. verificar `worker_execution_logs`;
3. verificar backlog vencido em `message_send_log`;
4. confirmar segredo `WHATSAPP_CRON_SECRET` igual em:
   - cron-job.org
   - Edge Function secret.

Interpretacao:

- se envia atrasado, o problema e orquestracao (scheduler), nao template.
- se nao ha log no worker, chamada nem chegou na Edge.

---

## 9) Causa raiz documentada (migracao)

- No banco antigo, `pg_cron` executava continuamente (run_details por minuto).
- No banco novo migrado, `pg_cron` ficou intermitente/sem last run efetivo.
- Worker da Edge funciona quando acionado.
- Portanto, falha principal: scheduler interno do banco novo.

---

## 10) Blindagem de mudancas

### 10.1 Regras obrigatorias

1. sem aprovacao explicita, nao alterar rotinas WhatsApp;
2. sem checklist completo, alteracao deve ser bloqueada;
3. manter fonte unica de scheduler automatico;
4. nao mudar auth/timezone/logica de envio sem teste de regressao.

### 10.2 Checklist obrigatorio

1. problema alvo claramente definido?
2. impacto no scheduler mapeado?
3. risco de duplicidade mapeado?
4. risco de atraso mapeado?
5. plano de rollback definido?
6. teste final em producao definido?
7. aprovacao explicita do proprietario registrada?

Sem todos os itens = **nao liberar alteracao**.

---

## 11) Rollback padrao

Se piorar o envio:

1. reverter para ultimo commit estavel do worker;
2. manter apenas scheduler oficial unico;
3. executar 2 agendamentos de validacao;
4. confirmar `SENT` no horario;
5. somente depois reabrir investigacao.

---

## 12) Arquivos de governanca relacionados

- Regra de bloqueio/checklist:
  - `.cursor/rules/whatsapp-change-control.mdc`
- Configuracao de scheduler unico:
  - `docs/WHATSAPP_SCHEDULER_SINGLE_SOURCE.md`
- Este runbook completo:
  - `docs/WHATSAPP_RUNBOOK_E_BLINDAGEM.md`
  - `docs/WHATSAPP_RUNBOOK_E_BLINDAGEM.pdf`
