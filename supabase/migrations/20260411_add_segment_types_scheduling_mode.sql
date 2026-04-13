-- Modo de agendamento por segmento (serviço vs quadra/arena).
-- Usado pelo sistema para rotear UX (dashboard, fluxos) sem depender do nome do segmento.

ALTER TABLE public.segment_types
  ADD COLUMN IF NOT EXISTS scheduling_mode TEXT NOT NULL DEFAULT 'service';

-- Garantir constraint mesmo se a coluna já existia sem CHECK (recria apenas o CHECK via nome de constraint)
ALTER TABLE public.segment_types
  DROP CONSTRAINT IF EXISTS segment_types_scheduling_mode_check;

ALTER TABLE public.segment_types
  ADD CONSTRAINT segment_types_scheduling_mode_check
  CHECK (scheduling_mode IN ('service', 'court'));

COMMENT ON COLUMN public.segment_types.scheduling_mode IS
  'service = agenda por colaborador/serviço; court = agenda por quadra/recurso físico.';
