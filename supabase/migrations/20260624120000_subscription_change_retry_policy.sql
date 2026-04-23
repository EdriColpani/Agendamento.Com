-- Governança de retry para requests de troca de plano.

ALTER TABLE public.subscription_change_requests
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retried_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_action_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_change_requests_retry_count
  ON public.subscription_change_requests(retry_count, created_at DESC);

