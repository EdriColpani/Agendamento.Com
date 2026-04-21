-- Corrige o agendamento de mensagens WhatsApp por evento:
-- - INSERT de agendamento: apenas lembretes (APPOINTMENT_REMINDER)
-- - UPDATE para concluido: apenas agradecimento (POST_SERVICE_THANKS)
--
-- Objetivo: evitar criação indevida de agradecimento no momento da criação.

CREATE OR REPLACE FUNCTION public.handle_appointment_creation_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    -- Regra já consolidada: agendamentos de quadra não entram no pipeline WhatsApp.
    IF COALESCE(NEW.booking_kind, 'service') = 'court' THEN
        RETURN NEW;
    END IF;

    BEGIN
        -- Em criação, processar somente lembretes.
        v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id, 'APPOINTMENT_REMINDER');

        IF v_result->>'success' = 'false' OR (v_result->>'logs_created')::INTEGER = 0 THEN
            RAISE WARNING 'WhatsApp (creation): Agendamento % - Resultado: %', NEW.id, v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Erro ao agendar lembretes WhatsApp para agendamento %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_appointment_completion_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    -- Regra já consolidada: agendamentos de quadra não entram no pipeline WhatsApp.
    IF COALESCE(NEW.booking_kind, 'service') = 'court' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.status = 'concluido'
       AND OLD.status != 'concluido' THEN
        BEGIN
            -- Em finalização, processar somente agradecimento.
            PERFORM public.schedule_whatsapp_messages_for_appointment(NEW.id, 'POST_SERVICE_THANKS');
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Erro ao agendar agradecimento WhatsApp pós-finalização para agendamento %: %', NEW.id, SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_appointment_creation_whatsapp() IS
'Trigger de criação: agenda somente APPOINTMENT_REMINDER.';

COMMENT ON FUNCTION public.handle_appointment_completion_whatsapp() IS
'Trigger de finalização: agenda somente POST_SERVICE_THANKS quando status vira concluido.';
