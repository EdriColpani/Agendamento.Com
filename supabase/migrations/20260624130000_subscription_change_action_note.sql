-- Auditoria de motivo das ações manuais de reprocessamento.

ALTER TABLE public.subscription_change_requests
  ADD COLUMN IF NOT EXISTS last_action_note text NULL;

