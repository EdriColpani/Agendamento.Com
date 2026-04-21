-- =====================================================
-- Adicionar suporte para multipart/form-data
-- =====================================================
-- Adiciona campo content_type para definir se usa JSON ou FormData
-- =====================================================

-- Adicionar coluna content_type (default 'json' para retrocompatibilidade)
ALTER TABLE public.messaging_providers 
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'json' CHECK (content_type IN ('json', 'form-data'));

-- Comentário para documentação
COMMENT ON COLUMN public.messaging_providers.content_type IS 
'Tipo de conteúdo da requisição: "json" para application/json ou "form-data" para multipart/form-data. Default: "json".';

