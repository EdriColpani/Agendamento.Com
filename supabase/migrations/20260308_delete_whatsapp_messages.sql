-- =====================================================
-- Função para excluir mensagens WhatsApp da fila (admin/owner)
-- =====================================================

CREATE OR REPLACE FUNCTION public.delete_whatsapp_messages_for_company(
  p_company_id UUID,
  p_ids UUID[] DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_owner_or_admin BOOLEAN := FALSE;
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'company_id é obrigatório');
  END IF;

  -- Verificar se o usuário é proprietário ou admin da empresa
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON uc.role_type = rt.id
    WHERE uc.user_id = v_user_id
      AND uc.company_id = p_company_id
      AND (rt.description = 'Proprietário' OR rt.description = 'Admin')
  ) INTO v_is_owner_or_admin;

  IF NOT v_is_owner_or_admin THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Acesso negado: você não tem permissão para excluir mensagens desta empresa.'
    );
  END IF;

  -- Excluir registros conforme filtros
  IF p_ids IS NOT NULL AND array_length(p_ids, 1) > 0 THEN
    DELETE FROM public.message_send_log
    WHERE company_id = p_company_id
      AND id = ANY(p_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    DELETE FROM public.message_send_log
    WHERE company_id = p_company_id
      AND channel = 'WHATSAPP'
      AND (p_status IS NULL OR status = p_status)
      AND (
        p_date IS NULL
        OR (scheduled_for::date = p_date)
      );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'deleted', v_deleted
  );
END;
$function$;

