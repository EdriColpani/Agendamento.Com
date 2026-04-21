-- =====================================================
-- Função para cancelar o envio de uma mensagem WhatsApp
-- =====================================================
-- Permite que um usuário autenticado (gerente/proprietário
-- da empresa) marque uma mensagem PENDENTE como CANCELADA.
-- =====================================================

CREATE OR REPLACE FUNCTION public.cancel_whatsapp_message(
    p_log_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_company_id UUID;
    v_user_id UUID := auth.uid();
    v_is_owner_or_admin BOOLEAN := FALSE;
    v_message_status TEXT;
BEGIN
    -- 1. Obter company_id da mensagem e o status atual
    SELECT company_id, status
    INTO v_company_id, v_message_status
    FROM public.message_send_log
    WHERE id = p_log_id;

    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Mensagem não encontrada.');
    END IF;

    -- 2. Verificar se o usuário é proprietário ou administrador da empresa
    SELECT EXISTS (
        SELECT 1
        FROM public.user_companies uc
        JOIN public.role_types rt ON uc.role_type = rt.id
        WHERE uc.user_id = v_user_id
          AND uc.company_id = v_company_id
          AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
    ) INTO v_is_owner_or_admin;

    IF NOT v_is_owner_or_admin THEN
        RETURN jsonb_build_object('error', 'Acesso negado: Você não tem permissão para cancelar mensagens desta empresa.');
    END IF;

    -- 3. Verificar se a mensagem pode ser cancelada (status PENDING)
    IF v_message_status != 'PENDING' THEN
        RETURN jsonb_build_object('error', 'Mensagem não pode ser cancelada. Status atual: ' || v_message_status);
    END IF;

    -- 4. Atualizar o status da mensagem para CANCELLED
    UPDATE public.message_send_log
    SET status = 'CANCELLED',
        sent_at = NOW(), -- Marcar a hora do cancelamento
        provider_response = jsonb_build_object('status', 'CANCELLED_MANUALLY', 'cancelled_by_user_id', v_user_id)
    WHERE id = p_log_id
    AND company_id = v_company_id;

    RETURN jsonb_build_object('success', TRUE, 'message', 'Mensagem cancelada com sucesso.');
END;
$function$;

