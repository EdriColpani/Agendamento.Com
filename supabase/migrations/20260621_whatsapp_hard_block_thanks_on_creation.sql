-- Hard fix WhatsApp:
-- Não permitir criação de POST_SERVICE_THANKS em fluxos de criação.
-- POST_SERVICE_THANKS só pode ser gerado quando:
-- 1) função for chamada explicitamente com filtro 'POST_SERVICE_THANKS'
-- 2) agendamento estiver com status = 'concluido'

CREATE OR REPLACE FUNCTION public.schedule_whatsapp_messages_for_appointment(
    p_appointment_id UUID,
    p_message_kind_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_appointment RECORD;
    v_company RECORD;
    v_client RECORD;
    v_schedules RECORD;
    v_template RECORD;
    v_provider RECORD;
    v_scheduled_for TIMESTAMPTZ;
    v_reference_date TIMESTAMPTZ;
    v_offset_value INTEGER;
    v_offset_unit TEXT;
    v_logs_created INTEGER := 0;
    v_logs_skipped INTEGER := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
    v_time_str TEXT;
    v_year INTEGER;
    v_month INTEGER;
    v_day INTEGER;
    v_hour INTEGER;
    v_minute INTEGER;
    v_phone_digits TEXT;
    v_phone_valid BOOLEAN := FALSE;
    v_total_schedules INTEGER;
    v_message_kind_filter TEXT := p_message_kind_code;
BEGIN
    SELECT
        a.id,
        a.company_id,
        a.client_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.created_at,
        COALESCE(a.booking_kind, 'service') AS booking_kind
    INTO v_appointment
    FROM appointments a
    WHERE a.id = p_appointment_id;

    IF v_appointment.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Agendamento não encontrado.');
    END IF;

    IF v_appointment.booking_kind = 'court' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Agendamento de quadra: envio de WhatsApp ignorado por regra.',
            'logs_created', 0
        );
    END IF;

    IF v_appointment.status = 'cancelado' THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Agendamento cancelado, nenhuma mensagem será agendada.', 'logs_created', 0);
    END IF;

    SELECT c.id, c.whatsapp_messaging_enabled
      INTO v_company
      FROM companies c
     WHERE c.id = v_appointment.company_id;
    IF v_company.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Empresa não encontrada.');
    END IF;
    IF NOT v_company.whatsapp_messaging_enabled THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Mensagens WhatsApp desabilitadas para esta empresa.', 'logs_created', 0);
    END IF;

    SELECT c.id, c.phone
      INTO v_client
      FROM clients c
     WHERE c.id = v_appointment.client_id;
    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cliente não encontrado.');
    END IF;
    IF v_client.phone IS NULL OR TRIM(v_client.phone) = '' THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Cliente sem telefone.', 'logs_created', 0, 'logs_skipped', 0, 'errors', ARRAY['Telefone NULL ou vazio']);
    END IF;

    v_phone_digits := REGEXP_REPLACE(v_client.phone, '[^0-9]', '', 'g');
    IF LENGTH(v_phone_digits) >= 10 AND v_phone_digits != REPEAT('0', LENGTH(v_phone_digits)) THEN
        v_phone_valid := TRUE;
    END IF;
    IF NOT v_phone_valid THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Telefone inválido.', 'logs_created', 0, 'logs_skipped', 0, 'errors', ARRAY['Telefone inválido']);
    END IF;

    SELECT mp.id, mp.name
      INTO v_provider
      FROM messaging_providers mp
     WHERE mp.channel = 'WHATSAPP'
       AND mp.is_active = TRUE
       AND mp.company_id = v_appointment.company_id
     LIMIT 1;

    IF v_provider.id IS NULL THEN
        SELECT mp.id, mp.name
          INTO v_provider
          FROM messaging_providers mp
         WHERE mp.channel = 'WHATSAPP'
           AND mp.is_active = TRUE
           AND mp.company_id IS NULL
         LIMIT 1;
    END IF;

    IF v_provider.id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Nenhum provedor de WhatsApp ativo.');
    END IF;

    SELECT COUNT(*)
      INTO v_total_schedules
      FROM company_message_schedules cms
      JOIN message_kinds mk ON mk.id = cms.message_kind_id
     WHERE cms.company_id = v_appointment.company_id
       AND cms.channel = 'WHATSAPP'
       AND cms.is_active = TRUE
       AND (v_message_kind_filter IS NULL OR mk.code = v_message_kind_filter);

    IF v_total_schedules = 0 THEN
        RETURN jsonb_build_object('success', TRUE, 'message', 'Nenhuma regra ativa.', 'logs_created', 0, 'logs_skipped', 0, 'errors', ARRAY['Nenhuma regra ativa']);
    END IF;

    FOR v_schedules IN
        SELECT
            cms.id,
            cms.message_kind_id,
            cms.offset_value,
            cms.offset_unit,
            cms.reference,
            mk.code AS message_kind_code
        FROM company_message_schedules cms
        JOIN message_kinds mk ON mk.id = cms.message_kind_id
        WHERE cms.company_id = v_appointment.company_id
          AND cms.channel = 'WHATSAPP'
          AND cms.is_active = TRUE
          AND (v_message_kind_filter IS NULL OR mk.code = v_message_kind_filter)
    LOOP
        BEGIN
            -- HARD BLOCK:
            -- Nunca criar POST_SERVICE_THANKS quando a função NÃO foi chamada explicitamente
            -- para esse tipo.
            IF v_schedules.message_kind_code = 'POST_SERVICE_THANKS'
               AND COALESCE(v_message_kind_filter, '') <> 'POST_SERVICE_THANKS' THEN
                v_logs_skipped := v_logs_skipped + 1;
                CONTINUE;
            END IF;

            -- HARD BLOCK:
            -- Mesmo com filtro explícito, só criar agradecimento se status = concluido.
            IF v_schedules.message_kind_code = 'POST_SERVICE_THANKS'
               AND COALESCE(v_appointment.status, '') <> 'concluido' THEN
                v_logs_skipped := v_logs_skipped + 1;
                CONTINUE;
            END IF;

            IF v_schedules.reference = 'APPOINTMENT_START' THEN
                v_time_str := SUBSTRING(v_appointment.appointment_time::TEXT FROM 1 FOR 5);
                v_year := EXTRACT(YEAR FROM v_appointment.appointment_date::DATE);
                v_month := EXTRACT(MONTH FROM v_appointment.appointment_date::DATE);
                v_day := EXTRACT(DAY FROM v_appointment.appointment_date::DATE);
                v_hour := CAST(SPLIT_PART(v_time_str, ':', 1) AS INTEGER);
                v_minute := CAST(SPLIT_PART(v_time_str, ':', 2) AS INTEGER);
                BEGIN
                    v_reference_date := (
                        v_year || '-' || LPAD(v_month::TEXT, 2, '0') || '-' || LPAD(v_day::TEXT, 2, '0')
                        || 'T' || LPAD(v_hour::TEXT, 2, '0') || ':' || LPAD(v_minute::TEXT, 2, '0') || ':00-03:00'
                    )::TIMESTAMPTZ;
                EXCEPTION WHEN OTHERS THEN
                    v_errors := array_append(v_errors, 'Erro APPOINTMENT_START: ' || SQLERRM);
                    v_logs_skipped := v_logs_skipped + 1;
                    CONTINUE;
                END;
            ELSIF v_schedules.reference = 'APPOINTMENT_CREATION' THEN
                v_reference_date := v_appointment.created_at;
            ELSIF v_schedules.reference = 'APPOINTMENT_COMPLETION' THEN
                v_reference_date := NOW();
            ELSE
                v_errors := array_append(v_errors, 'Referência não tratada: ' || v_schedules.reference);
                v_logs_skipped := v_logs_skipped + 1;
                CONTINUE;
            END IF;

            v_offset_value := v_schedules.offset_value;
            v_offset_unit := v_schedules.offset_unit;
            CASE v_offset_unit
                WHEN 'MINUTES' THEN v_scheduled_for := v_reference_date + (v_offset_value || ' minutes')::INTERVAL;
                WHEN 'HOURS' THEN v_scheduled_for := v_reference_date + (v_offset_value || ' hours')::INTERVAL;
                WHEN 'DAYS' THEN v_scheduled_for := v_reference_date + (v_offset_value || ' days')::INTERVAL;
                ELSE
                    v_errors := array_append(v_errors, 'Unidade inválida: ' || v_offset_unit);
                    v_logs_skipped := v_logs_skipped + 1;
                    CONTINUE;
            END CASE;

            SELECT cmt.id
              INTO v_template
              FROM company_message_templates cmt
             WHERE cmt.company_id = v_appointment.company_id
               AND cmt.message_kind_id = v_schedules.message_kind_id
               AND cmt.channel = 'WHATSAPP'
               AND cmt.is_active = TRUE
             LIMIT 1;

            INSERT INTO message_send_log (
                company_id,
                client_id,
                appointment_id,
                message_kind_id,
                channel,
                template_id,
                provider_id,
                scheduled_for,
                sent_at,
                status
            )
            VALUES (
                v_appointment.company_id,
                v_appointment.client_id,
                p_appointment_id,
                v_schedules.message_kind_id,
                'WHATSAPP',
                COALESCE(v_template.id, NULL),
                v_provider.id,
                v_scheduled_for,
                NULL,
                'PENDING'
            );

            v_logs_created := v_logs_created + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := array_append(v_errors, 'Erro log: ' || SQLERRM);
            v_logs_skipped := v_logs_skipped + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Concluído.',
        'logs_created', v_logs_created,
        'logs_skipped', v_logs_skipped,
        'errors', v_errors
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Erro: ' || SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.schedule_whatsapp_messages_for_appointment(UUID, TEXT) IS
'Hard fix: POST_SERVICE_THANKS só é criado com filtro explícito POST_SERVICE_THANKS e status concluido.';
