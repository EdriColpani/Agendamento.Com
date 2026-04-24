-- Hardening do trigger de finalizacao para mensagens de agradecimento.
-- Objetivo: garantir comportamento consistente em todos os ambientes e
-- evitar falha silenciosa quando nenhum log e criado.

CREATE OR REPLACE FUNCTION public.handle_appointment_completion_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    -- Agendamentos de quadra continuam fora do pipeline de servico.
    IF COALESCE(NEW.booking_kind, 'service') = 'court' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.status = 'concluido'
       AND OLD.status != 'concluido' THEN
        BEGIN
            -- Na finalizacao, processar somente agradecimento.
            v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id, 'POST_SERVICE_THANKS');

            IF v_result->>'success' = 'false' OR COALESCE((v_result->>'logs_created')::INTEGER, 0) = 0 THEN
                RAISE WARNING 'WhatsApp (completion): Agendamento % sem agradecimento criado. Resultado=%',
                    NEW.id,
                    v_result::TEXT;
            END IF;

        EXCEPTION
            WHEN undefined_function THEN
                -- Compatibilidade com ambientes legados (assinatura antiga).
                BEGIN
                    v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id);
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'WhatsApp (completion): erro no fallback legado para agendamento %: % (%).',
                        NEW.id,
                        SQLERRM,
                        SQLSTATE;
                    RETURN NEW;
                END;

                IF v_result->>'success' = 'false' OR COALESCE((v_result->>'logs_created')::INTEGER, 0) = 0 THEN
                    RAISE WARNING 'WhatsApp (completion): fallback legado sem logs para agendamento %. Resultado=%',
                        NEW.id,
                        v_result::TEXT;
                END IF;

            WHEN OTHERS THEN
                RAISE WARNING 'WhatsApp (completion): erro ao agendar agradecimento para agendamento %: % (%).',
                    NEW.id,
                    SQLERRM,
                    SQLSTATE;
        END;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_appointment_completion_whatsapp ON public.appointments;
CREATE TRIGGER trg_appointment_completion_whatsapp
    AFTER UPDATE OF status ON public.appointments
    FOR EACH ROW
    WHEN (NEW.status = 'concluido' AND OLD.status != 'concluido')
    EXECUTE FUNCTION public.handle_appointment_completion_whatsapp();

COMMENT ON FUNCTION public.handle_appointment_completion_whatsapp() IS
'Trigger de finalizacao: agenda POST_SERVICE_THANKS com diagnostico de logs criados e recriacao idempotente do trigger.';
