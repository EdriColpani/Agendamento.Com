-- =====================================================
-- CRIAÇÃO DA TABELA plan_limits
-- =====================================================
-- Esta tabela armazena limites configuráveis por plano
-- Permite definir limites flexíveis para diferentes recursos
-- (colaboradores, serviços, clientes, etc.)
-- =====================================================
-- IMPORTANTE: Esta migração NÃO altera nenhuma tabela existente
-- Apenas cria uma nova tabela e suas políticas RLS
-- =====================================================

-- Criar tabela plan_limits
CREATE TABLE IF NOT EXISTS public.plan_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  limit_type TEXT NOT NULL, -- 'collaborators', 'services', 'clients', etc.
  limit_value INTEGER NOT NULL DEFAULT 0, -- 0 ou NULL = ilimitado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Um plano só pode ter um limite de cada tipo
  UNIQUE(plan_id, limit_type)
);

-- Comentários para documentação
COMMENT ON TABLE public.plan_limits IS 
'Tabela que armazena limites configuráveis por plano de assinatura. Permite definir limites flexíveis para diferentes recursos.';

COMMENT ON COLUMN public.plan_limits.plan_id IS 
'ID do plano de assinatura ao qual este limite se aplica.';

COMMENT ON COLUMN public.plan_limits.limit_type IS 
'Tipo de limite (ex: "collaborators", "services", "clients"). Define qual recurso está sendo limitado.';

COMMENT ON COLUMN public.plan_limits.limit_value IS 
'Valor do limite. 0 ou NULL significa ilimitado. Valores positivos definem o limite máximo.';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_id ON public.plan_limits(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_limits_limit_type ON public.plan_limits(limit_type);
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_type ON public.plan_limits(plan_id, limit_type);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_plan_limits_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_limits_updated_at ON public.plan_limits;
CREATE TRIGGER trg_plan_limits_updated_at
BEFORE UPDATE ON public.plan_limits
FOR EACH ROW
EXECUTE FUNCTION public.set_plan_limits_updated_at();

-- =====================================================
-- FIM DA CRIAÇÃO DA TABELA
-- =====================================================

