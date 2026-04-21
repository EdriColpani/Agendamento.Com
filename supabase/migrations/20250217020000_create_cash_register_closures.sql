-- =====================================================
-- Criação da tabela cash_register_closures
-- =====================================================
-- Tabela para rastrear fechamentos de caixa por período
-- Suporta fechamento diário, semanal, quinzenal e mensal
-- =====================================================

-- Criar tabela cash_register_closures
CREATE TABLE IF NOT EXISTS public.cash_register_closures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  closure_type text NOT NULL CHECK (closure_type IN ('dia', 'semana', 'quinzena', 'mes')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_receipts numeric(10,2) NOT NULL DEFAULT 0,
  total_expenses numeric(10,2) NOT NULL DEFAULT 0,
  total_balance numeric(10,2) NOT NULL DEFAULT 0,
  cash_counted numeric(10,2) NOT NULL DEFAULT 0,
  card_pix_total numeric(10,2) NOT NULL DEFAULT 0,
  observations text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraint: Não permitir fechamentos sobrepostos do mesmo tipo no mesmo período
  CONSTRAINT no_overlapping_closures UNIQUE (company_id, closure_type, start_date, end_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cash_register_closures_company ON public.cash_register_closures(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_closures_type ON public.cash_register_closures(closure_type);
CREATE INDEX IF NOT EXISTS idx_cash_register_closures_dates ON public.cash_register_closures(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cash_register_closures_user ON public.cash_register_closures(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_closures_created ON public.cash_register_closures(created_at);

-- Habilitar RLS
ALTER TABLE public.cash_register_closures ENABLE ROW LEVEL SECURITY;

-- Política RLS: Usuários podem ver fechamentos de suas empresas
DROP POLICY IF EXISTS "authenticated_users_can_view_cash_register_closures" ON public.cash_register_closures;
CREATE POLICY "authenticated_users_can_view_cash_register_closures"
ON public.cash_register_closures
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_register_closures.company_id
      AND uc.user_id = auth.uid()
  )
);

-- Política RLS: Usuários podem criar fechamentos para suas empresas
DROP POLICY IF EXISTS "authenticated_users_can_insert_cash_register_closures" ON public.cash_register_closures;
CREATE POLICY "authenticated_users_can_insert_cash_register_closures"
ON public.cash_register_closures
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.user_companies uc
    WHERE uc.company_id = cash_register_closures.company_id
      AND uc.user_id = auth.uid()
  )
  AND user_id = auth.uid()
);

-- Função para verificar se uma data está dentro de um período fechado
CREATE OR REPLACE FUNCTION public.is_period_closed(
  p_company_id uuid,
  p_transaction_date timestamptz
)
RETURNS boolean AS $$
DECLARE
  v_is_closed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.cash_register_closures
    WHERE company_id = p_company_id
      AND DATE(p_transaction_date) >= start_date
      AND DATE(p_transaction_date) <= end_date
  ) INTO v_is_closed;
  
  RETURN COALESCE(v_is_closed, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários para documentação
COMMENT ON TABLE public.cash_register_closures IS 'Rastreia fechamentos de caixa por período (dia, semana, quinzena, mês)';
COMMENT ON COLUMN public.cash_register_closures.closure_type IS 'Tipo de fechamento: dia, semana, quinzena, mes';
COMMENT ON COLUMN public.cash_register_closures.start_date IS 'Data inicial do período fechado';
COMMENT ON COLUMN public.cash_register_closures.end_date IS 'Data final do período fechado';
COMMENT ON COLUMN public.cash_register_closures.total_receipts IS 'Total de recebimentos no período';
COMMENT ON COLUMN public.cash_register_closures.total_expenses IS 'Total de despesas no período';
COMMENT ON COLUMN public.cash_register_closures.total_balance IS 'Saldo final (recebimentos - despesas)';
COMMENT ON FUNCTION public.is_period_closed IS 'Verifica se uma data está dentro de um período fechado';


