-- =====================================================
-- ADICIONAR COLUNA payment_method NA TABELA appointments
-- =====================================================
-- Esta migration adiciona a coluna payment_method na tabela appointments
-- para armazenar a forma de pagamento escolhida na finalização do agendamento
-- =====================================================

-- Adicionar coluna payment_method se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'appointments'
    AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.appointments
    ADD COLUMN payment_method TEXT CHECK (payment_method IN ('dinheiro', 'cartao_credito', 'cartao_debito', 'pix'));
    
    RAISE NOTICE 'Coluna payment_method adicionada com sucesso à tabela appointments';
  ELSE
    RAISE NOTICE 'Coluna payment_method já existe na tabela appointments';
  END IF;
END $$;

-- Criar índice para melhor performance em consultas
CREATE INDEX IF NOT EXISTS idx_appointments_payment_method ON public.appointments(payment_method);

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================

