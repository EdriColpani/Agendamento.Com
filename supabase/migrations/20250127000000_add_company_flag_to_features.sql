-- =====================================================
-- Adicionar coluna company_flag_name na tabela features
-- =====================================================
-- Esta coluna armazena o nome do flag da tabela companies
-- que será controlado por esta funcionalidade
-- =====================================================

-- Adicionar coluna company_flag_name (nullable)
ALTER TABLE public.features 
ADD COLUMN IF NOT EXISTS company_flag_name TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.features.company_flag_name IS 
'Nome do flag na tabela companies que esta funcionalidade controla. Ex: "whatsapp_messaging_enabled". NULL se não controla nenhum flag.';

-- Índice para consultas por flag (opcional, mas útil)
CREATE INDEX IF NOT EXISTS idx_features_company_flag_name 
ON public.features(company_flag_name) 
WHERE company_flag_name IS NOT NULL;

