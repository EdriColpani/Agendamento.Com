-- Blindagem de segurança:
-- Impede criar mensagens POST_SERVICE_THANKS para agendamentos que ainda não estão concluídos.
-- Isso protege o fluxo mesmo se alguma rotina chamar schedule_whatsapp_messages_for_appointment
-- sem filtro correto.

CREATE OR REPLACE FUNCTION public.guard_whatsapp_post_service_thanks_only_on_concluded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
BEGIN
    -- Só validar WhatsApp com appointment_id preenchido
    IF NEW.channel <> 'WHATSAPP' OR NEW.appointment_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Só bloquear o tipo de agradecimento pós-atendimento
    IF NOT EXISTS (
        SELECT 1
          FROM public.message_kinds mk
         WHERE mk.id = NEW.message_kind_id
           AND mk.code = 'POST_SERVICE_THANKS'
    ) THEN
        RETURN NEW;
    END IF;

    -- Blindagem forte: só permite se o agendamento existir E estiver concluído.
    IF NOT EXISTS (
        SELECT 1
          FROM public.appointments a
         WHERE a.id = NEW.appointment_id
           AND COALESCE(a.status, '') = 'concluido'
    ) THEN
        RAISE WARNING
          'Bloqueado POST_SERVICE_THANKS indevido (agendamento não concluído ou inexistente). appointment_id=%, status_atual=%',
          NEW.appointment_id,
          (SELECT COALESCE(a2.status, 'NULL')
             FROM public.appointments a2
            WHERE a2.id = NEW.appointment_id
            LIMIT 1);
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_whatsapp_post_service_thanks_only_on_concluded
    ON public.message_send_log;

CREATE TRIGGER trg_guard_whatsapp_post_service_thanks_only_on_concluded
BEFORE INSERT OR UPDATE ON public.message_send_log
FOR EACH ROW
EXECUTE FUNCTION public.guard_whatsapp_post_service_thanks_only_on_concluded();

COMMENT ON FUNCTION public.guard_whatsapp_post_service_thanks_only_on_concluded() IS
'Bloqueia inserção de POST_SERVICE_THANKS quando appointment.status != concluido.';
