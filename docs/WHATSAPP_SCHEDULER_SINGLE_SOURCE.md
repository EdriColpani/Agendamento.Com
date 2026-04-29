# WhatsApp Scheduler - Fonte Unica

Objetivo: manter uma unica fonte de disparo automatico do worker WhatsApp para evitar atrasos e conflitos.

## Orquestrador oficial

- Usar somente `cron-job.org` para chamar a Edge Function:
  - URL: `https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler`
  - Metodo: `POST`
  - Frequencia: `*/1 * * * *` (a cada 1 minuto)
  - Headers:
    - `Content-Type: application/json`
    - `Authorization: Bearer <WHATSAPP_CRON_SECRET>`
  - Body:
    - `{"source":"external_cron","timestamp":"auto"}`

## O que deve ficar desativado

- Agendamento automatico do workflow GitHub de WhatsApp (deixar apenas manual).
- `pg_cron` do job `whatsapp-message-scheduler-job` no banco novo enquanto estiver intermitente.

## Validacao operacional por minuto

1. Verificar execucao recente no worker:
   - `worker_execution_logs` deve ter registro novo a cada 1-2 minutos.
2. Verificar pendencias vencidas:
   - `pending_due` nao deve crescer continuamente.

## Regra de operacao

- Nao adicionar segundo scheduler automatico em paralelo.
- Se precisar trocar de orquestrador, desativar o atual antes de ativar o novo.
