-- Estende métricas de saúde WhatsApp com idade da pendência vencida mais antiga.
-- Isso permite alerta visual quando houver backlog vencido por mais de X minutos.

DROP FUNCTION IF EXISTS public.get_whatsapp_queue_health(uuid);

CREATE OR REPLACE FUNCTION public.get_whatsapp_queue_health(p_company_id uuid)
RETURNS TABLE (
  pending_due bigint,
  pending_total bigint,
  sent_24h bigint,
  failed_24h bigint,
  oldest_pending_due_minutes integer,
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
      ) AS failed_24h,
      MIN(m.scheduled_for) FILTER (
        WHERE m.channel = 'WHATSAPP'
          AND m.company_id = p_company_id
          AND m.status = 'PENDING'
          AND m.scheduled_for <= now()
      ) AS oldest_pending_due_at
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
    CASE
      WHEN q.oldest_pending_due_at IS NULL THEN 0
      ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - q.oldest_pending_due_at)) / 60)::integer)
    END AS oldest_pending_due_minutes,
    COALESCE(w.status, 'NO_RUN') AS last_worker_status,
    w.execution_time AS last_worker_execution_time
  FROM queue q
  LEFT JOIN worker w ON TRUE;
$$;

COMMENT ON FUNCTION public.get_whatsapp_queue_health(uuid) IS
'Resumo de saúde da fila WhatsApp por empresa, incluindo idade (minutos) da pendência vencida mais antiga.';
