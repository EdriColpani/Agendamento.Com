-- Blindagem operacional do pipeline WhatsApp:
-- 1) Throttle de disparo do worker para evitar rajada de chamadas HTTP.
-- 2) Kick apenas para mensagens proximas da janela de envio.
-- 3) Indices para acelerar varredura de PENDING.

CREATE TABLE IF NOT EXISTS public.whatsapp_scheduler_dispatch_guard (
  id integer PRIMARY KEY CHECK (id = 1),
  last_dispatched_at timestamptz NOT NULL DEFAULT 'epoch'::timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_scheduler_dispatch_guard (id, last_dispatched_at, updated_at)
VALUES (1, 'epoch'::timestamptz, now())
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_message_send_log_whatsapp_pending_scheduled_for
ON public.message_send_log (scheduled_for)
WHERE channel = 'WHATSAPP' AND status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_message_send_log_whatsapp_pending_created_at
ON public.message_send_log (created_at DESC)
WHERE channel = 'WHATSAPP' AND status = 'PENDING';

CREATE OR REPLACE FUNCTION public.kick_whatsapp_scheduler_on_pending_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_rows_updated integer := 0;
BEGIN
  -- So atua para filas WhatsApp pendentes.
  IF NEW.channel <> 'WHATSAPP' OR NEW.status <> 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Se o envio esta distante, evita "kick" prematuro.
  -- O cron normal continua responsavel por processar no horario.
  IF NEW.scheduled_for > (now() + interval '20 minutes') THEN
    RETURN NEW;
  END IF;

  v_token := public.get_whatsapp_cron_auth_token();
  IF v_token IS NULL OR btrim(v_token) = '' THEN
    RAISE WARNING 'WhatsApp kick: token ausente em get_whatsapp_cron_auth_token().';
    RETURN NEW;
  END IF;

  -- Throttle global: no maximo 1 disparo a cada 20s.
  UPDATE public.whatsapp_scheduler_dispatch_guard
     SET last_dispatched_at = now(),
         updated_at = now()
   WHERE id = 1
     AND last_dispatched_at < (now() - interval '20 seconds');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object(
      'source', 'db_trigger_hardened',
      'message_log_id', NEW.id,
      'appointment_id', NEW.appointment_id,
      'ts', now()
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'WhatsApp kick falhou para log %: % (%)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

COMMENT ON TABLE public.whatsapp_scheduler_dispatch_guard IS
'Controle de throttle para disparo do worker WhatsApp via trigger.';

COMMENT ON FUNCTION public.kick_whatsapp_scheduler_on_pending_insert() IS
'Fallback hardened: dispara worker WhatsApp com throttle e apenas para mensagens proximas da janela.';
