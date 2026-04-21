-- =====================================================
-- CORREÇÃO COMPLETA DO SISTEMA DE MENSAGENS WHATSAPP
-- =====================================================
-- Este script corrige:
-- 1. Trigger para enviar mensagem quando agendamento é finalizado
-- 2. Função SQL corrigida para APPOINTMENT_START e APPOINTMENT_CREATION
-- 3. Cron job configurado corretamente
-- =====================================================

-- =====================================================
-- PARTE 1: CORRIGIR FUNÇÃO SQL
-- =====================================================

-- Criar tipo POST_SERVICE_THANKS se não existir
INSERT INTO message_kinds (code, default_name, description)
VALUES
  ('POST_SERVICE_THANKS', 'Agradecimento Pós-Atendimento', 'Mensagem de agradecimento enviada após finalizar o atendimento')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.schedule_whatsapp_messages_for_appointment(
    p_appointment_id UUID,
    p_message_kind_code TEXT DEFAULT NULL  -- NULL = processar todos, 'APPOINTMENT_REMINDER' = apenas lembretes, 'POST_SERVICE_THANKS' = apenas agradecimentos
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
    v_message_kind RECORD;
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
BEGIN
    -- 1. Buscar dados do agendamento
    SELECT 
        a.id,
        a.company_id,
        a.client_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.created_at
    INTO v_appointment
    FROM appointments a
    WHERE a.id = p_appointment_id;

    IF v_appointment.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Agendamento não encontrado.'
        );
    END IF;

    -- 2. Verificar se o agendamento não está cancelado
    IF v_appointment.status = 'cancelado' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Agendamento cancelado, nenhuma mensagem será agendada.',
            'logs_created', 0
        );
    END IF;

    -- 3. Buscar dados da empresa e verificar se WhatsApp está habilitado
    SELECT 
        c.id,
        c.whatsapp_messaging_enabled
    INTO v_company
    FROM companies c
    WHERE c.id = v_appointment.company_id;

    IF v_company.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Empresa não encontrada.'
        );
    END IF;

    IF NOT v_company.whatsapp_messaging_enabled THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Mensagens WhatsApp desabilitadas para esta empresa.',
            'logs_created', 0
        );
    END IF;

    -- 4. Buscar dados do cliente e verificar telefone
    SELECT 
        c.id,
        c.phone
    INTO v_client
    FROM clients c
    WHERE c.id = v_appointment.client_id;

    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cliente não encontrado.'
        );
    END IF;

    -- Validar telefone do cliente
    IF v_client.phone IS NULL OR TRIM(v_client.phone) = '' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Cliente não possui telefone cadastrado.',
            'logs_created', 0,
            'logs_skipped', 0,
            'errors', ARRAY['Telefone do cliente é NULL ou vazio']
        );
    END IF;

    -- Validar se o telefone não é um placeholder inválido
    v_phone_digits := REGEXP_REPLACE(v_client.phone, '[^0-9]', '', 'g');
    
    IF LENGTH(v_phone_digits) >= 10 THEN
        IF v_phone_digits != REPEAT('0', LENGTH(v_phone_digits)) THEN
            v_phone_valid := TRUE;
        END IF;
    END IF;
    
    IF NOT v_phone_valid THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Telefone do cliente é inválido (placeholder ou formato incorreto).',
            'logs_created', 0,
            'logs_skipped', 0,
            'errors', ARRAY['Telefone inválido: ' || v_client.phone || ' (após limpeza: ' || COALESCE(v_phone_digits, 'NULL') || ')']
        );
    END IF;

    -- 5. Buscar provedor de WhatsApp ativo para a empresa
    -- Primeiro tenta buscar provedor específico da empresa
    SELECT 
        mp.id,
        mp.name
    INTO v_provider
    FROM messaging_providers mp
    WHERE mp.channel = 'WHATSAPP'
      AND mp.is_active = TRUE
      AND mp.company_id = v_appointment.company_id
    LIMIT 1;

    -- Se não encontrou provedor específico, busca provedor global (legado)
    IF v_provider.id IS NULL THEN
        SELECT 
            mp.id,
            mp.name
        INTO v_provider
        FROM messaging_providers mp
        WHERE mp.channel = 'WHATSAPP'
          AND mp.is_active = TRUE
          AND mp.company_id IS NULL
        LIMIT 1;
    END IF;

    IF v_provider.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Nenhum provedor de WhatsApp ativo encontrado para esta empresa.'
        );
    END IF;

    -- 6. Buscar regras de envio ativas para a empresa
    SELECT COUNT(*) INTO v_total_schedules
    FROM company_message_schedules cms
    WHERE cms.company_id = v_appointment.company_id
      AND cms.channel = 'WHATSAPP'
      AND cms.is_active = TRUE;
    
    IF v_total_schedules = 0 THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Nenhuma regra de envio ativa encontrada para esta empresa.',
            'logs_created', 0,
            'logs_skipped', 0,
            'errors', ARRAY['Nenhuma regra de envio ativa encontrada']
        );
    END IF;

    -- 7. Processar cada regra de envio
    FOR v_schedules IN
        SELECT 
            cms.id,
            cms.message_kind_id,
            cms.offset_value,
            cms.offset_unit,
            cms.reference
        FROM company_message_schedules cms
        WHERE cms.company_id = v_appointment.company_id
          AND cms.channel = 'WHATSAPP'
          AND cms.is_active = TRUE
    LOOP
        BEGIN
            -- 8. Calcular data/hora de referência baseado no tipo
            IF v_schedules.reference = 'APPOINTMENT_START' THEN
                -- Usar data/hora do agendamento
                v_time_str := SUBSTRING(v_appointment.appointment_time::TEXT FROM 1 FOR 5);
                v_year := EXTRACT(YEAR FROM v_appointment.appointment_date::DATE);
                v_month := EXTRACT(MONTH FROM v_appointment.appointment_date::DATE);
                v_day := EXTRACT(DAY FROM v_appointment.appointment_date::DATE);
                v_hour := CAST(SPLIT_PART(v_time_str, ':', 1) AS INTEGER);
                v_minute := CAST(SPLIT_PART(v_time_str, ':', 2) AS INTEGER);
                
                BEGIN
                    v_reference_date := (
                        v_year || '-' || 
                        LPAD(v_month::TEXT, 2, '0') || '-' || 
                        LPAD(v_day::TEXT, 2, '0') || 'T' || 
                        LPAD(v_hour::TEXT, 2, '0') || ':' || 
                        LPAD(v_minute::TEXT, 2, '0') || ':00-03:00'
                    )::TIMESTAMPTZ;
                EXCEPTION
                    WHEN OTHERS THEN
                        v_errors := array_append(v_errors, 'Erro ao calcular data de referência para APPOINTMENT_START: ' || SQLERRM);
                        v_logs_skipped := v_logs_skipped + 1;
                        CONTINUE;
                END;
                
            ELSIF v_schedules.reference = 'APPOINTMENT_CREATION' THEN
                -- Usar created_at (momento da criação do agendamento)
                v_reference_date := v_appointment.created_at;
                
            ELSIF v_schedules.reference = 'APPOINTMENT_COMPLETION' THEN
                -- Momento em que a função é chamada = finalização do atendimento.
                -- "1 minuto após finalizar" = NOW() + offset (ex.: 1 minuto).
                v_reference_date := NOW();
                
            ELSE
                -- Tipo de referência não suportado
                v_errors := array_append(v_errors, 'Tipo de referência não tratado: ' || v_schedules.reference);
                v_logs_skipped := v_logs_skipped + 1;
                CONTINUE;
            END IF;

            -- 9. Calcular scheduled_for aplicando o offset
            v_offset_value := v_schedules.offset_value;
            v_offset_unit := v_schedules.offset_unit;
            
            CASE v_offset_unit
                WHEN 'MINUTES' THEN
                    v_scheduled_for := v_reference_date + (v_offset_value || ' minutes')::INTERVAL;
                WHEN 'HOURS' THEN
                    v_scheduled_for := v_reference_date + (v_offset_value || ' hours')::INTERVAL;
                WHEN 'DAYS' THEN
                    v_scheduled_for := v_reference_date + (v_offset_value || ' days')::INTERVAL;
                ELSE
                    v_errors := array_append(v_errors, 'Unidade de offset inválida: ' || v_offset_unit);
                    v_logs_skipped := v_logs_skipped + 1;
                    CONTINUE;
            END CASE;

            -- 10. Remover logs antigos para este appointment + message_kind
            DELETE FROM message_send_log
            WHERE appointment_id = p_appointment_id
              AND message_kind_id = v_schedules.message_kind_id
              AND channel = 'WHATSAPP'
              AND status IN ('PENDING', 'CANCELLED', 'FAILED');

            -- 11. Buscar template ativo
            SELECT cmt.id INTO v_template
            FROM company_message_templates cmt
            WHERE cmt.company_id = v_appointment.company_id
              AND cmt.message_kind_id = v_schedules.message_kind_id
              AND cmt.channel = 'WHATSAPP'
              AND cmt.is_active = TRUE
            LIMIT 1;

            -- 12. Inserir log na message_send_log (template_id pode ser NULL)
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
            ) VALUES (
                v_appointment.company_id,
                v_appointment.client_id,
                p_appointment_id,
                v_schedules.message_kind_id,
                'WHATSAPP',
                COALESCE(v_template.id, NULL),  -- Permite NULL se não houver template
                v_provider.id,
                v_scheduled_for,
                NULL,
                'PENDING'
            );

            v_logs_created := v_logs_created + 1;

        EXCEPTION
            WHEN OTHERS THEN
                v_errors := array_append(v_errors, 
                    'Erro ao criar log para message_kind ' || COALESCE(v_schedules.message_kind_id::TEXT, 'NULL') || 
                    ': ' || SQLERRM
                );
                v_logs_skipped := v_logs_skipped + 1;
        END;
    END LOOP;

    -- 13. Retornar resultado
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', CASE 
            WHEN v_logs_created > 0 THEN 'Processamento concluído com sucesso.'
            WHEN v_logs_skipped > 0 AND array_length(v_errors, 1) > 0 THEN 'Nenhum log criado. Verifique os erros.'
            ELSE 'Processamento concluído.'
        END,
        'logs_created', v_logs_created,
        'logs_skipped', v_logs_skipped,
        'errors', v_errors
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Erro inesperado: ' || SQLERRM
        );
END;
$function$;

-- =====================================================
-- PARTE 2: TRIGGERS PARA WHATSAPP
-- =====================================================

-- 2.1: Trigger para quando agendamento é CRIADO
CREATE OR REPLACE FUNCTION public.handle_appointment_creation_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    -- Quando um agendamento é CRIADO, agendar mensagens automaticamente
    -- Isso garante que funcione independente do frontend
    BEGIN
        v_result := public.schedule_whatsapp_messages_for_appointment(NEW.id);
        
        -- Logar resultado para debug
        IF v_result->>'success' = 'false' OR (v_result->>'logs_created')::INTEGER = 0 THEN
            RAISE WARNING 'WhatsApp: Agendamento % - Resultado: %', NEW.id, v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Logar erro mas não impedir a criação do agendamento
        RAISE WARNING 'Erro ao agendar mensagens WhatsApp para agendamento %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

-- 2.2: Trigger para quando agendamento é FINALIZADO
CREATE OR REPLACE FUNCTION public.handle_appointment_completion_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    -- Quando um agendamento é finalizado (status = 'concluido')
    -- e o status anterior não era 'concluido', agendar mensagem de agradecimento
    IF TG_OP = 'UPDATE' 
       AND NEW.status = 'concluido' 
       AND OLD.status != 'concluido' THEN
        
        BEGIN
            -- Chamar função para agendar mensagens (incluindo POST_SERVICE_THANKS)
            PERFORM public.schedule_whatsapp_messages_for_appointment(NEW.id);
        EXCEPTION WHEN OTHERS THEN
            -- Logar erro mas não impedir a finalização
            RAISE WARNING 'Erro ao agendar mensagens WhatsApp pós-finalização para agendamento %: %', NEW.id, SQLERRM;
        END;
        
    END IF;

    RETURN NEW;
END;
$function$;

-- Remover triggers antigos se existirem
DROP TRIGGER IF EXISTS trg_appointment_creation_whatsapp ON public.appointments;
DROP TRIGGER IF EXISTS trg_appointment_completion_whatsapp ON public.appointments;

-- Criar trigger para CRIAÇÃO (INSERT)
CREATE TRIGGER trg_appointment_creation_whatsapp
    AFTER INSERT ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_creation_whatsapp();

-- Criar trigger para FINALIZAÇÃO (UPDATE)
CREATE TRIGGER trg_appointment_completion_whatsapp
    AFTER UPDATE OF status ON public.appointments
    FOR EACH ROW
    WHEN (NEW.status = 'concluido' AND OLD.status != 'concluido')
    EXECUTE FUNCTION public.handle_appointment_completion_whatsapp();

-- =====================================================
-- PARTE 3: CONFIGURAR CRON JOB
-- =====================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover jobs antigos
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN 
        SELECT jobid, jobname 
        FROM cron.job 
        WHERE jobname LIKE '%whatsapp%' OR command LIKE '%whatsapp-message-scheduler%'
    LOOP
        BEGIN
            PERFORM cron.unschedule(job_record.jobname);
        EXCEPTION WHEN OTHERS THEN
            -- Ignorar erros
        END;
    END LOOP;
END $$;

-- Criar novo cron job (executa a cada 2 minutos)
SELECT cron.schedule(
    'whatsapp-message-scheduler-job',
    '*/2 * * * *',  -- A cada 2 minutos
    $$
    SELECT net.http_post(
        url := 'https://ocawpokndruxakzmhzsa.supabase.co/functions/v1/whatsapp-message-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
) AS job_id;

-- =====================================================
-- COMENTÁRIOS
-- =====================================================
COMMENT ON FUNCTION public.schedule_whatsapp_messages_for_appointment(UUID) IS 
'Agenda mensagens WhatsApp baseado nas regras configuradas. Suporta:
- APPOINTMENT_START: Usa data/hora do agendamento (appointment_date + appointment_time)
- APPOINTMENT_CREATION: Usa created_at (ou updated_at se status = concluido para mensagens pós-finalização)';

COMMENT ON FUNCTION public.handle_appointment_creation_whatsapp() IS 
'Trigger que detecta quando um agendamento é CRIADO e agenda mensagens automaticamente (lembrete, etc)';

COMMENT ON FUNCTION public.handle_appointment_completion_whatsapp() IS 
'Trigger que detecta quando um agendamento é FINALIZADO e agenda mensagem de agradecimento';

