-- Lock explicito para processamento do worker de WhatsApp.
-- Evita envio duplicado em execucoes concorrentes e permite retentativa
-- automatica quando uma execucao morrer no meio do processamento.

ALTER TABLE public.message_send_log
ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS processing_by text NULL;

CREATE INDEX IF NOT EXISTS idx_message_send_log_processing_pending
ON public.message_send_log (processing_started_at)
WHERE channel = 'WHATSAPP' AND status = 'PENDING';

-- Saneia locks antigos presos (mais de 15 minutos) em mensagens pendentes.
UPDATE public.message_send_log
SET processing_started_at = NULL,
    processing_by = NULL
WHERE channel = 'WHATSAPP'
  AND status = 'PENDING'
  AND processing_started_at IS NOT NULL
  AND processing_started_at < (now() - interval '15 minutes');

