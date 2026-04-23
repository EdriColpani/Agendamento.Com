-- ============================================================
-- TESTE E2E - Troca de plano (upgrade/downgrade)
-- Executar no SQL Editor do Supabase para validação operacional.
-- ============================================================

-- 1) Assinatura ativa atual por empresa
SELECT
  cs.company_id,
  cs.id AS subscription_id,
  cs.plan_id,
  sp.name AS plan_name,
  cs.status,
  cs.start_date,
  cs.end_date,
  cs.billing_cycle_start,
  cs.billing_cycle_end,
  cs.next_plan_id,
  cs.pending_change_type
FROM public.company_subscriptions cs
LEFT JOIN public.subscription_plans sp ON sp.id = cs.plan_id
WHERE cs.company_id = '<COMPANY_ID>'
ORDER BY cs.end_date DESC NULLS LAST
LIMIT 5;

-- 2) Requests recentes de troca de plano
SELECT
  scr.id,
  scr.company_id,
  scr.subscription_id,
  scr.change_type,
  scr.status,
  scr.billing_period,
  scr.proration_amount,
  scr.effective_at,
  scr.payment_attempt_id,
  scr.payment_gateway_reference,
  scr.failure_reason,
  scr.created_at,
  scr.applied_at
FROM public.subscription_change_requests scr
WHERE scr.company_id = '<COMPANY_ID>'
ORDER BY scr.created_at DESC
LIMIT 20;

-- 3) Conferir request + payment_attempt vinculados
SELECT
  scr.id AS change_request_id,
  scr.status AS change_status,
  scr.change_type,
  scr.proration_amount,
  pa.id AS payment_attempt_id,
  pa.status AS payment_status,
  pa.amount AS payment_amount,
  pa.payment_gateway_reference
FROM public.subscription_change_requests scr
LEFT JOIN public.payment_attempts pa ON pa.id = scr.payment_attempt_id
WHERE scr.company_id = '<COMPANY_ID>'
ORDER BY scr.created_at DESC
LIMIT 20;

-- 4) Consistência global: requests aplicadas sem atualização da assinatura
SELECT
  scr.id AS change_request_id,
  scr.company_id,
  scr.to_plan_id,
  cs.plan_id AS current_subscription_plan
FROM public.subscription_change_requests scr
JOIN public.company_subscriptions cs ON cs.id = scr.subscription_id
WHERE scr.status = 'applied'
  AND cs.plan_id <> scr.to_plan_id
ORDER BY scr.created_at DESC
LIMIT 50;

-- 5) Consistência global: downgrades scheduled já vencidos (possível atraso scheduler)
SELECT
  id,
  company_id,
  subscription_id,
  effective_at,
  now() AS now_utc
FROM public.subscription_change_requests
WHERE change_type = 'downgrade'
  AND status = 'scheduled'
  AND effective_at <= now()
ORDER BY effective_at ASC
LIMIT 100;

