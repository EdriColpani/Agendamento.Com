# Como reativar o scheduler WhatsApp

Desativação temporária em 2026-09-13: nenhum cliente no plano WhatsApp.
O código da Edge Function, tabelas, RPCs e triggers **não foram removidos**.

## Estado após a otimização

| Peça | Estado |
|------|--------|
| Edge Function `whatsapp-message-scheduler` | Código intacto (consultas otimizadas) |
| Job pg_cron `whatsapp-message-scheduler-job` | `active = false` (não apagado) |
| Trigger `trg_kick_whatsapp_scheduler_on_pending_insert` | **Não existe em produção** (só o guard de thanks). A migration desativa o kick **se** o trigger existir. |
| cron-job.org | Fora do repositório — desligar manualmente no painel se ainda estiver ativo |

## Ordem de reativação

1. Confirmar que há cliente(s) com WhatsApp habilitado e instância conectada.
2. Fazer deploy da Edge Function `whatsapp-message-scheduler` (se o código otimizado ainda não estiver em produção).
3. Reativar **somente uma** fonte automática:
   - **Preferência do projeto (docs atuais):** cron-job.org a cada 1 min, **ou**
   - pg_cron (abaixo). **Nunca as duas ao mesmo tempo.**
4. Reativar o kick HTTP só se a fonte automática for pg_cron/cron-job.org e houver necessidade de disparo imediato após INSERT (hoje o worker periódico basta).

## SQL — reativar pg_cron (não apaga / não recria)

```sql
UPDATE cron.job
SET active = true
WHERE jobname = 'whatsapp-message-scheduler-job';

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'whatsapp-message-scheduler-job';
```

## SQL — reativar o trigger de kick (opcional)

```sql
ALTER TABLE public.message_send_log
  ENABLE TRIGGER trg_kick_whatsapp_scheduler_on_pending_insert;
```

## cron-job.org

URL típica (documentada no repo):

`POST https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler`

Header: `Authorization: Bearer <WHATSAPP_CRON_SECRET>`

Se reativar o cron-job.org, mantenha `cron.job.active = false` no pg_cron.

## Dependências

- `WHATSAPP_CRON_SECRET` / `get_whatsapp_cron_auth_token()`
- Tabelas: `message_send_log`, `company_message_schedules`, `whatsapp_instances`
- Funções: `schedule_whatsapp_messages_for_appointment`, `get_whatsapp_queue_health`

## Checklist (regra do projeto)

- Uma única fonte oficial de scheduler.
- Sem segundo cron automático.
- Teste: 1 mensagem PENDING de homologação → envio no próximo ciclo.
