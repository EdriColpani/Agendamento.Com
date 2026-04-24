-- Hardening de compatibilidade para agendamentos de SERVICO.
-- Objetivo: evitar perda silenciosa de logs WhatsApp quando o filtro
-- APPOINTMENT_REMINDER nao encontra configuracao valida no ambiente.

CREATE OR REPLACE FUNCTION public.handle_appointment_creation_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    -- Agendamentos de quadra continuam fora deste pipeline.
    IF COALESCE(NEW.booking_kind, 'service') = 'court' THEN
        RETURN NEW;
    END IF;

    BEGIN
        -- Caminho principal: criacao agenda somente lembretes.
        v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id, 'APPOINTMENT_REMINDER');

        -- Fallback defensivo:
        -- Se nada foi criado (config incompleta, kind ausente, mismatch de dados),
        -- reprocessa sem filtro para nao perder mensagens de servico.
        IF COALESCE((v_result->>'logs_created')::INTEGER, 0) = 0 THEN
            v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id);
        END IF;

        IF v_result->>'success' = 'false' OR COALESCE((v_result->>'logs_created')::INTEGER, 0) = 0 THEN
            RAISE WARNING 'WhatsApp (creation): Agendamento % sem logs criados. Resultado=%',
                NEW.id,
                v_result::TEXT;
        END IF;

    EXCEPTION
        WHEN undefined_function THEN
            -- Compatibilidade para ambientes com versao legada (assinatura antiga).
            BEGIN
                v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id);
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'WhatsApp (creation): erro no fallback legado para agendamento %: % (%).',
                    NEW.id,
                    SQLERRM,
                    SQLSTATE;
                RETURN NEW;
            END;

            IF v_result->>'success' = 'false' OR COALESCE((v_result->>'logs_created')::INTEGER, 0) = 0 THEN
                RAISE WARNING 'WhatsApp (creation): fallback legado sem logs para agendamento %. Resultado=%',
                    NEW.id,
                    v_result::TEXT;
            END IF;

        WHEN OTHERS THEN
            RAISE WARNING 'WhatsApp (creation): erro ao agendar mensagens para agendamento %: % (%).',
                NEW.id,
                SQLERRM,
                SQLSTATE;
    END;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_appointment_creation_whatsapp() IS
'Trigger de criacao (servico): tenta APPOINTMENT_REMINDER e aplica fallback sem filtro para evitar perda silenciosa de logs.';
