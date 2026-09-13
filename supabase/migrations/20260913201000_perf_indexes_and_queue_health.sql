-- Performance: escopo da saúde da fila WhatsApp + índices quentes + totais de caixa.
-- CREATE INDEX CONCURRENTLY não cabe em migration transacional do Supabase MCP.
-- Índices usam IF NOT EXISTS (sem CONCURRENTLY).

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
        WHERE m.status = 'PENDING'
          AND m.scheduled_for <= now()
      ) AS pending_due,
      COUNT(*) FILTER (
        WHERE m.status = 'PENDING'
      ) AS pending_total,
      COUNT(*) FILTER (
        WHERE m.status = 'SENT'
          AND m.sent_at >= (now() - interval '24 hours')
      ) AS sent_24h,
      COUNT(*) FILTER (
        WHERE m.status = 'FAILED'
          AND COALESCE(m.sent_at, m.updated_at, m.created_at) >= (now() - interval '24 hours')
      ) AS failed_24h,
      MIN(m.scheduled_for) FILTER (
        WHERE m.status = 'PENDING'
          AND m.scheduled_for <= now()
      ) AS oldest_pending_due_at
    FROM public.message_send_log m
    WHERE m.company_id = p_company_id
      AND m.channel = 'WHATSAPP'
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
  'Resumo de saúde da fila WhatsApp por empresa (filtra company_id + channel no FROM).';

CREATE OR REPLACE FUNCTION public.get_company_cash_totals(p_company_id uuid)
RETURNS TABLE (
  entradas numeric,
  saidas numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(total_amount) FILTER (
      WHERE transaction_type IN ('recebimento', 'abertura')
    ), 0) AS entradas,
    COALESCE(SUM(total_amount) FILTER (
      WHERE transaction_type = 'despesa'
    ), 0) AS saidas
  FROM public.cash_movements
  WHERE company_id = p_company_id;
$$;

REVOKE ALL ON FUNCTION public.get_company_cash_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_cash_totals(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_company_cash_totals(uuid) IS
  'Totais de entradas/saídas do caixa da empresa sem transferir todas as linhas ao cliente.';

CREATE INDEX IF NOT EXISTS idx_appointments_company_date
  ON public.appointments (company_id, appointment_date);

CREATE INDEX IF NOT EXISTS idx_appointments_company_status_created
  ON public.appointments (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_send_log_company_channel_status_sched
  ON public.message_send_log (company_id, channel, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_message_send_log_appointment_id
  ON public.message_send_log (appointment_id);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_status
  ON public.company_subscriptions (company_id, status);

CREATE INDEX IF NOT EXISTS idx_cash_movements_company_date
  ON public.cash_movements (company_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_clients_company_name
  ON public.clients (company_id, name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'user_companies'
      AND indexdef ILIKE '%user_id%'
      AND indexdef ILIKE '%company_id%'
  ) THEN
    CREATE INDEX idx_user_companies_user_company
      ON public.user_companies (user_id, company_id);
  END IF;
END $$;
