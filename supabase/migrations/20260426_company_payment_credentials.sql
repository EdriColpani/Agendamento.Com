-- =====================================================
-- CREDENCIAIS DE PAGAMENTO POR EMPRESA (Fase 0 backend)
-- =====================================================
-- Nova tabela apenas; não altera tabelas ou políticas existentes.
-- Segredos ficam em encrypted_payload; acesso direto via PostgREST
-- bloqueado (RLS sem políticas para authenticated/anon). Edge Functions
-- com service role fazem leitura/gravação.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.company_payment_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  provider_account_id TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  validation_error TEXT NULL,
  last_validated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_payment_credentials_provider_check CHECK (
    provider = ANY (ARRAY['mercadopago'::text])
  ),
  CONSTRAINT company_payment_credentials_company_provider_unique UNIQUE (company_id, provider)
);

COMMENT ON TABLE public.company_payment_credentials IS
  'Credenciais de gateway por empresa; payload cifrado na aplicação (Edge). Sem políticas RLS para JWT — só service role.';

CREATE INDEX IF NOT EXISTS idx_company_payment_credentials_company_id
  ON public.company_payment_credentials(company_id);

CREATE OR REPLACE FUNCTION public.set_company_payment_credentials_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_payment_credentials_updated_at ON public.company_payment_credentials;
CREATE TRIGGER trg_company_payment_credentials_updated_at
BEFORE UPDATE ON public.company_payment_credentials
FOR EACH ROW
EXECUTE FUNCTION public.set_company_payment_credentials_updated_at();

ALTER TABLE public.company_payment_credentials ENABLE ROW LEVEL SECURITY;

-- Nenhuma política para authenticated/anon: negação implícita no PostgREST.
-- Service role do Supabase ignora RLS.
