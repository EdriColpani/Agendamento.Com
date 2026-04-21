-- =====================================================
-- CANCELAMENTO AUTOMÁTICO DE MENSAGENS WHATSAPP
-- QUANDO O AGENDAMENTO FOR CANCELADO / DESISTÊNCIA
-- =====================================================
-- Regra de negócio:
-- - Sempre que um agendamento mudar de status para
--   'cancelado' ou 'desistencia', todas as mensagens
--   WhatsApp pendentes ligadas a esse agendamento
--   na tabela message_send_log devem ser marcadas
--   como 'CANCELLED'.
-- - Isso garante que o cliente não receba lembretes
--   ou mensagens de agradecimento após cancelar.
-- =====================================================

DO $$
BEGIN
  -- Criar ou atualizar função de trigger
  CREATE OR REPLACE FUNCTION public.handle_appointment_whatsapp_auto_cancel()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $function$
  BEGIN
    -- Só agir em updates onde o status mudou
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      -- Quando o agendamento for cancelado ou marcado como desistência,
      -- cancelar todas as mensagens WhatsApp pendentes associadas
      IF NEW.status IN ('cancelado', 'desistencia') THEN
        UPDATE public.message_send_log
        SET status = 'CANCELLED'
        WHERE appointment_id = NEW.id
          AND channel = 'WHATSAPP'
          AND status = 'PENDING';
      END IF;
    END IF;

    RETURN NEW;
  END;
  $function$;

  -- Remover trigger antigo se existir
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_appointment_whatsapp_auto_cancel'
  ) THEN
    DROP TRIGGER trg_appointment_whatsapp_auto_cancel ON public.appointments;
  END IF;

  -- Criar trigger para disparar após alteração de status do agendamento
  CREATE TRIGGER trg_appointment_whatsapp_auto_cancel
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_appointment_whatsapp_auto_cancel();
END $$;

-- =====================================================
-- FIM: CANCELAMENTO AUTOMÁTICO DE MENSAGENS WHATSAPP
-- =====================================================


