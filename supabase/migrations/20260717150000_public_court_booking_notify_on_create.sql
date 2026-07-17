-- Ajuste de regra: o aviso de reserva pública passa a ser enviado na CRIAÇÃO da reserva
-- (assim que o cliente reserva pelo link público), e não mais somente na confirmação.

-- 1) Remove o gatilho antigo (baseado na transição para "confirmado").
DROP TRIGGER IF EXISTS trg_notify_public_court_booking_confirmed ON public.appointments;
DROP FUNCTION IF EXISTS public.notify_public_court_booking_confirmed();

-- 2) Nova função: dispara na criação da reserva pública de quadra.
CREATE OR REPLACE FUNCTION public.notify_public_court_booking_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF COALESCE(NEW.booking_kind, 'service') <> 'court' OR NEW.created_by_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(trim(COALESCE(c.public_booking_notification_email, '')), '')
    INTO v_email
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/send-public-court-booking-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body := jsonb_build_object('appointment_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao disparar notificação de reserva pública % : %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_public_court_booking_created() IS
  'Dispara e-mail (edge function) na criação de reserva pública de quadra (origem link público).';

-- 3) Gatilho na criação (INSERT) da reserva pública.
CREATE TRIGGER trg_notify_public_court_booking_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  WHEN (
    COALESCE(NEW.booking_kind, 'service') = 'court'
    AND NEW.created_by_user_id IS NULL
    AND NEW.public_booking_notified_at IS NULL
  )
  EXECUTE FUNCTION public.notify_public_court_booking_created();
