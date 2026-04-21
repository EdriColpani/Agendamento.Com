-- Adicionar campo billing_period na tabela admin_coupons para restringir uso por período de cobrança
-- Valores permitidos:
-- - 'any'     -> cupom vale para qualquer período (mensal ou anual)
-- - 'monthly' -> cupom só pode ser usado em assinaturas mensais
-- - 'yearly'  -> cupom só pode ser usado em assinaturas anuais

ALTER TABLE public.admin_coupons
ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'any'
CHECK (billing_period IN ('any', 'monthly', 'yearly'));

COMMENT ON COLUMN public.admin_coupons.billing_period IS 'Período de cobrança permitido para o cupom: any = qualquer, monthly = apenas mensal, yearly = apenas anual';


