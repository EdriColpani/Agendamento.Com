-- Arena UX: endereço e imagem por quadra (multiunidade).
-- Mantém compatibilidade: todos os campos são opcionais.

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS zip_code text NULL,
  ADD COLUMN IF NOT EXISTS address text NULL,
  ADD COLUMN IF NOT EXISTS number text NULL,
  ADD COLUMN IF NOT EXISTS neighborhood text NULL,
  ADD COLUMN IF NOT EXISTS complement text NULL,
  ADD COLUMN IF NOT EXISTS city text NULL,
  ADD COLUMN IF NOT EXISTS state text NULL;

COMMENT ON COLUMN public.courts.image_url IS 'Imagem da quadra/arena usada na agenda visual.';
COMMENT ON COLUMN public.courts.zip_code IS 'CEP do endereço da quadra/arena.';
COMMENT ON COLUMN public.courts.address IS 'Logradouro da quadra/arena.';
COMMENT ON COLUMN public.courts.number IS 'Número do endereço da quadra/arena.';
COMMENT ON COLUMN public.courts.neighborhood IS 'Bairro da quadra/arena.';
COMMENT ON COLUMN public.courts.complement IS 'Complemento do endereço da quadra/arena.';
COMMENT ON COLUMN public.courts.city IS 'Cidade da quadra/arena.';
COMMENT ON COLUMN public.courts.state IS 'UF da quadra/arena.';
