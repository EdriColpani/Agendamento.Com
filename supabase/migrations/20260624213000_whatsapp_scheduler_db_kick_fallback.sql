-- Fallback operacional: dispara o worker de WhatsApp sem depender de pg_cron.
-- Sempre que um log PENDING de WhatsApp for inserido, envia um "kick" assíncrono
-- para a Edge Function whatsapp-message-scheduler via pg_net.

CREATE OR REPLACE FUNCTION public.kick_whatsapp_scheduler_on_pending_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- So atua para filas WhatsApp pendentes.
  IF NEW.channel <> 'WHATSAPP' OR NEW.status <> 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Reutiliza funcao ja padronizada do projeto.
  v_token := public.get_whatsapp_cron_auth_token();

  IF v_token IS NULL OR btrim(v_token) = '' THEN
    RAISE WARNING 'WhatsApp kick: token ausente em get_whatsapp_cron_auth_token().';
    RETURN NEW;
  END IF;

  -- Chamada assíncrona; nao bloqueia transacao principal.
  PERFORM net.http_post(
    url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object(
      'source', 'db_trigger_fallback',
      'message_log_id', NEW.id,
      'appointment_id', NEW.appointment_id,
      'ts', now()
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Nao interrompe operacao de negocio por falha de disparo assíncrono.
    RAISE WARNING 'WhatsApp kick falhou para log %: % (%)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kick_whatsapp_scheduler_on_pending_insert ON public.message_send_log;
CREATE TRIGGER trg_kick_whatsapp_scheduler_on_pending_insert
AFTER INSERT ON public.message_send_log
FOR EACH ROW
WHEN (NEW.channel = 'WHATSAPP' AND NEW.status = 'PENDING')
EXECUTE FUNCTION public.kick_whatsapp_scheduler_on_pending_insert();

COMMENT ON FUNCTION public.kick_whatsapp_scheduler_on_pending_insert() IS
'Fallback sem pg_cron: ao inserir PENDING em message_send_log (WHATSAPP), dispara o worker via net.http_post.';
