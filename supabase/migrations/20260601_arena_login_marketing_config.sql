-- Configuração global das 4 imagens de marketing da tela pública /arena (login Arena)
-- Leitura pública; escrita apenas administrador global (type_user).

CREATE TABLE IF NOT EXISTS public.arena_login_marketing_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  image_url_1 text,
  image_url_2 text,
  image_url_3 text,
  image_url_4 text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.arena_login_marketing_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_arena_login_marketing_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arena_login_marketing_updated_at ON public.arena_login_marketing_config;
CREATE TRIGGER trg_arena_login_marketing_updated_at
  BEFORE UPDATE ON public.arena_login_marketing_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_arena_login_marketing_updated_at();

ALTER TABLE public.arena_login_marketing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arena_login_marketing_select_public" ON public.arena_login_marketing_config;
CREATE POLICY "arena_login_marketing_select_public"
  ON public.arena_login_marketing_config
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "arena_login_marketing_update_global_admin" ON public.arena_login_marketing_config;
CREATE POLICY "arena_login_marketing_update_global_admin"
  ON public.arena_login_marketing_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.type_user tu
      WHERE tu.user_id = auth.uid()
        AND UPPER(COALESCE(tu.cod, '')) IN (
          'GLOBAL_ADMIN',
          'ADMIN_GLOBAL',
          'ADMINISTRADOR_GLOBAL',
          'SUPER_ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.type_user tu
      WHERE tu.user_id = auth.uid()
        AND UPPER(COALESCE(tu.cod, '')) IN (
          'GLOBAL_ADMIN',
          'ADMIN_GLOBAL',
          'ADMINISTRADOR_GLOBAL',
          'SUPER_ADMIN'
        )
    )
  );

COMMENT ON TABLE public.arena_login_marketing_config IS 'URLs públicas das 4 imagens do painel esquerdo da página /arena (login).';

-- Bucket Storage: imagens públicas; escrita só admin global
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'arena-login-marketing',
  'arena-login-marketing',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "arena_login_marketing_storage_select" ON storage.objects;
CREATE POLICY "arena_login_marketing_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'arena-login-marketing');

DROP POLICY IF EXISTS "arena_login_marketing_storage_insert" ON storage.objects;
CREATE POLICY "arena_login_marketing_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'arena-login-marketing'
    AND EXISTS (
      SELECT 1
      FROM public.type_user tu
      WHERE tu.user_id = auth.uid()
        AND UPPER(COALESCE(tu.cod, '')) IN (
          'GLOBAL_ADMIN',
          'ADMIN_GLOBAL',
          'ADMINISTRADOR_GLOBAL',
          'SUPER_ADMIN'
        )
    )
  );

DROP POLICY IF EXISTS "arena_login_marketing_storage_update" ON storage.objects;
CREATE POLICY "arena_login_marketing_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'arena-login-marketing'
    AND EXISTS (
      SELECT 1
      FROM public.type_user tu
      WHERE tu.user_id = auth.uid()
        AND UPPER(COALESCE(tu.cod, '')) IN (
          'GLOBAL_ADMIN',
          'ADMIN_GLOBAL',
          'ADMINISTRADOR_GLOBAL',
          'SUPER_ADMIN'
        )
    )
  );

DROP POLICY IF EXISTS "arena_login_marketing_storage_delete" ON storage.objects;
CREATE POLICY "arena_login_marketing_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'arena-login-marketing'
    AND EXISTS (
      SELECT 1
      FROM public.type_user tu
      WHERE tu.user_id = auth.uid()
        AND UPPER(COALESCE(tu.cod, '')) IN (
          'GLOBAL_ADMIN',
          'ADMIN_GLOBAL',
          'ADMINISTRADOR_GLOBAL',
          'SUPER_ADMIN'
        )
    )
  );
