-- Notificação por e-mail ao dono da arena quando uma reserva de origem PÚBLICA
-- (link público, created_by_user_id IS NULL) é CONFIRMADA/paga.
-- Fonte única: trigger no banco cobre tanto o webhook do Mercado Pago quanto a
-- confirmação manual no balcão, sem tocar em nenhum dos dois fluxos.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) E-mail configurável pelo dono da arena (destino da notificação).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_booking_notification_email text;

COMMENT ON COLUMN public.companies.public_booking_notification_email IS
  'E-mail que recebe aviso quando uma reserva pública de quadra é confirmada. Vazio = notificação desligada.';

-- 2) Trava de idempotência: garante um único e-mail por reserva.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS public_booking_notified_at timestamptz;

COMMENT ON COLUMN public.appointments.public_booking_notified_at IS
  'Momento em que o e-mail de reserva pública confirmada foi enviado. Preenchido pela edge function; evita reenvio.';

-- 3) Função de trigger: dispara a edge function de e-mail via pg_net.
CREATE OR REPLACE FUNCTION public.notify_public_court_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Apenas reservas de quadra criadas pelo link público.
  IF COALESCE(NEW.booking_kind, 'service') <> 'court' OR NEW.created_by_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Só notifica quando a empresa tem e-mail de notificação configurado.
  SELECT NULLIF(trim(COALESCE(c.public_booking_notification_email, '')), '')
    INTO v_email
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Dispara a edge function; a própria function marca public_booking_notified_at.
  BEGIN
    PERFORM net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/send-public-court-booking-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('appointment_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquear a confirmação da reserva por causa da notificação.
    RAISE WARNING 'Falha ao disparar notificação de reserva pública % : %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_public_court_booking_confirmed() IS
  'Dispara e-mail (edge function) quando reserva pública de quadra passa a confirmado; idempotente via public_booking_notified_at.';

-- 4) Trigger: só na transição para "confirmado", origem pública e ainda não notificada.
DROP TRIGGER IF EXISTS trg_notify_public_court_booking_confirmed ON public.appointments;

CREATE TRIGGER trg_notify_public_court_booking_confirmed
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  WHEN (
    NEW.status = 'confirmado'
    AND OLD.status IS DISTINCT FROM 'confirmado'
    AND NEW.public_booking_notified_at IS NULL
    AND COALESCE(NEW.booking_kind, 'service') = 'court'
    AND NEW.created_by_user_id IS NULL
  )
  EXECUTE FUNCTION public.notify_public_court_booking_confirmed();
