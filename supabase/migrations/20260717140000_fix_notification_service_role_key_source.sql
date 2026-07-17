-- Correção: usar public.get_service_role_key() (lê de app_config, com fallback) como fonte
-- do token de service role nas chamadas net.http_post, pois current_setting('app.settings.service_role_key')
-- está vazio no contexto do pg_cron/trigger neste projeto (gerava 401).

-- 1) Trigger de notificação de reserva pública confirmada.
CREATE OR REPLACE FUNCTION public.notify_public_court_booking_confirmed()
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

-- 2) Cron de lembrete de vencimento: recriar usando get_service_role_key().
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
        'Authorization', 'Bearer ' || public.get_service_role_key()
      ),
      body := jsonb_build_object('limit', 500)
    ) AS request_id;
  $$
);
