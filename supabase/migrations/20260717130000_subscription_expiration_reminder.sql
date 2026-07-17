-- Lembrete de vencimento de assinatura por e-mail (não depende da sessão web aberta).
-- Um cron diário aciona a edge function, que envia e-mail ao e-mail comercial da empresa
-- em janelas fixas: 3 dias antes, no dia, D+1 e D+3 após o vencimento.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Log de lembretes enviados (evita reenvio do mesmo lembrete).
--    A chave (subscription_id, end_date, days_offset) garante 1 e-mail por janela por ciclo;
--    ao renovar (end_date muda), o novo ciclo libera novos lembretes.
CREATE TABLE IF NOT EXISTS public.subscription_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  end_date date NOT NULL,
  days_offset integer NOT NULL,
  email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_reminder_log_cycle
  ON public.subscription_reminder_log (subscription_id, end_date, days_offset);

COMMENT ON TABLE public.subscription_reminder_log IS
  'Registro de lembretes de vencimento de assinatura enviados por e-mail; usado para deduplicação.';
COMMENT ON COLUMN public.subscription_reminder_log.days_offset IS
  'Dias até o vencimento no envio: 3=faltam 3 dias, 0=vence hoje, -1=venceu ontem, -3=venceu há 3 dias.';

-- Acesso somente via service role (edge function). RLS ligado sem policies bloqueia o restante.
ALTER TABLE public.subscription_reminder_log ENABLE ROW LEVEL SECURITY;

-- 2) Índice para a varredura diária por vencimento.
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status_end_date
  ON public.company_subscriptions (status, end_date);

-- 3) Cron diário às 12:00 UTC (09:00 America/Sao_Paulo).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'subscription-expiration-reminder-job'
  ) THEN
    PERFORM cron.unschedule('subscription-expiration-reminder-job');
  END IF;
END $$;

SELECT cron.schedule(
  'subscription-expiration-reminder-job',
  '0 12 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/subscription-expiration-reminder-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('limit', 500)
    ) AS request_id;
  $$
);
