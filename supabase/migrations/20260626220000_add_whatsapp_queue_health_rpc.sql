-- Observabilidade WhatsApp: resumo de saúde da fila por empresa.
-- Retorna métricas operacionais para acompanhamento rápido no painel.

CREATE OR REPLACE FUNCTION public.get_whatsapp_queue_health(p_company_id uuid)
RETURNS TABLE (
  pending_due bigint,
  pending_total bigint,
  sent_24h bigint,
  failed_24h bigint,
  last_worker_status text,
  last_worker_execution_time timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH queue AS (
    SELECT
      COUNT(*) FILTER (
        WHERE m.channel = 'WHATSAPP'
          AND m.company_id = p_company_id
          AND m.status = 'PENDING'
          AND m.scheduled_for <= now()
      ) AS pending_due,
      COUNT(*) FILTER (
        WHERE m.channel = 'WHATSAPP'
          AND m.company_id = p_company_id
          AND m.status = 'PENDING'
      ) AS pending_total,
      COUNT(*) FILTER (
        WHERE m.channel = 'WHATSAPP'
          AND m.company_id = p_company_id
          AND m.status = 'SENT'
          AND m.sent_at >= (now() - interval '24 hours')
      ) AS sent_24h,
      COUNT(*) FILTER (
        WHERE m.channel = 'WHATSAPP'
          AND m.company_id = p_company_id
          AND m.status = 'FAILED'
          AND COALESCE(m.sent_at, m.updated_at, m.created_at) >= (now() - interval '24 hours')
      ) AS failed_24h
    FROM public.message_send_log m
  ),
  worker AS (
    SELECT
      w.status,
      w.execution_time
    FROM public.worker_execution_logs w
    ORDER BY w.execution_time DESC
    LIMIT 1
  )
  SELECT
    q.pending_due,
    q.pending_total,
    q.sent_24h,
    q.failed_24h,
    COALESCE(w.status, 'NO_RUN') AS last_worker_status,
    w.execution_time AS last_worker_execution_time
  FROM queue q
  LEFT JOIN worker w ON TRUE;
$$;

COMMENT ON FUNCTION public.get_whatsapp_queue_health(uuid) IS
'Resumo de saúde da fila WhatsApp por empresa (pendências vencidas, falhas/enviadas 24h e último status do worker).';
