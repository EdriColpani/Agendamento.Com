-- =====================================================
-- ADICIONAR CAMPO apresentar NA TABELA role_types
-- =====================================================
-- Este campo controla se o perfil deve estar visível em outras partes do sistema
-- =====================================================

-- Adicionar coluna apresentar se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'role_types'
    AND column_name = 'apresentar'
  ) THEN
    ALTER TABLE public.role_types
    ADD COLUMN apresentar BOOLEAN NOT NULL DEFAULT true;
    
    RAISE NOTICE 'Coluna apresentar adicionada com sucesso à tabela role_types';
  ELSE
    RAISE NOTICE 'Coluna apresentar já existe na tabela role_types';
  END IF;
END $$;

-- Criar índice para melhor performance em consultas
CREATE INDEX IF NOT EXISTS idx_role_types_apresentar ON public.role_types(apresentar);

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================

