-- Ajuste de blindagem:
-- A regra de POST_SERVICE_THANKS deve bloquear somente criacao indevida da fila (PENDING),
-- sem impedir atualizacao operacional de status (SENT/FAILED/CANCELLED).

CREATE OR REPLACE FUNCTION public.guard_whatsapp_post_service_thanks_only_on_concluded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

    -- Permitir updates de manutencao/operacao para estados finais.
    -- A blindagem deve atuar apenas quando o registro estiver sendo criado/reativado como PENDING.
    IF TG_OP = 'UPDATE' AND COALESCE(NEW.status, '') <> 'PENDING' THEN
        RETURN NEW;
    END IF;

    -- Blindagem forte: só permite criar/reativar PENDING se o agendamento estiver concluído.
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

COMMENT ON FUNCTION public.guard_whatsapp_post_service_thanks_only_on_concluded() IS
'Bloqueia criação/reativação PENDING de POST_SERVICE_THANKS quando appointment.status != concluido, sem travar updates operacionais.';
