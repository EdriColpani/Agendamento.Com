-- =====================================================
-- ADICIONAR company_id À TABELA messaging_providers
-- =====================================================
-- Esta migration adiciona suporte para provedores por empresa
-- Mantém compatibilidade com sistema atual (company_id nullable inicialmente)
-- =====================================================

-- 1. Adicionar coluna company_id (nullable inicialmente para não quebrar sistema atual)
ALTER TABLE public.messaging_providers 
ADD COLUMN IF NOT EXISTS company_id UUID;

-- 2. Adicionar comentário
COMMENT ON COLUMN public.messaging_providers.company_id IS 
'ID da empresa à qual este provedor pertence. NULL indica provedor global (legado).';

-- 3. Criar foreign key para companies (com opção de NULL para compatibilidade)
DO $$
BEGIN
  -- Verificar se a foreign key já existe
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'messaging_providers_company_id_fkey'
  ) THEN
    ALTER TABLE public.messaging_providers
    ADD CONSTRAINT messaging_providers_company_id_fkey
    FOREIGN KEY (company_id) 
    REFERENCES public.companies(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Foreign key messaging_providers_company_id_fkey criada com sucesso.';
  ELSE
    RAISE NOTICE 'Foreign key messaging_providers_company_id_fkey já existe.';
  END IF;
END $$;

-- 4. Criar índice para performance (busca por empresa)
CREATE INDEX IF NOT EXISTS idx_messaging_providers_company_id 
ON public.messaging_providers(company_id);

-- 5. Criar índice composto para busca otimizada (company_id + channel + is_active)
CREATE INDEX IF NOT EXISTS idx_messaging_providers_company_channel_active 
ON public.messaging_providers(company_id, channel, is_active) 
WHERE is_active = true;

-- 6. Migrar provedores existentes (se houver)
-- Se existirem provedores sem company_id, vamos migrar para a primeira empresa encontrada
-- que tenha whatsapp_messaging_enabled = true
DO $$
DECLARE
  v_first_company_id UUID;
  v_providers_count INTEGER;
BEGIN
  -- Contar provedores sem company_id
  SELECT COUNT(*) INTO v_providers_count
  FROM public.messaging_providers
  WHERE company_id IS NULL;
  
  IF v_providers_count > 0 THEN
    -- Buscar primeira empresa com WhatsApp habilitado
    SELECT id INTO v_first_company_id
    FROM public.companies
    WHERE whatsapp_messaging_enabled = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Se encontrou empresa, migrar provedores
    IF v_first_company_id IS NOT NULL THEN
      UPDATE public.messaging_providers
      SET company_id = v_first_company_id
      WHERE company_id IS NULL;
      
      RAISE NOTICE 'Migrados % provedor(es) para a empresa ID: %', v_providers_count, v_first_company_id;
    ELSE
      -- Se não encontrou empresa, deixar NULL (sistema continuará funcionando)
      RAISE WARNING 'Nenhuma empresa com WhatsApp habilitado encontrada. Provedores mantidos sem company_id.';
    END IF;
  ELSE
    RAISE NOTICE 'Nenhum provedor sem company_id encontrado.';
  END IF;
END $$;

-- =====================================================
-- NOTA IMPORTANTE:
-- =====================================================
-- Esta migration mantém company_id como NULLABLE para não quebrar
-- o sistema atual. Em uma migration futura, após validação completa,
-- podemos tornar NOT NULL se necessário.
-- =====================================================

