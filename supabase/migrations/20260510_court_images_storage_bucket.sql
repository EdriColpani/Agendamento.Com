-- Bucket público para imagens das quadras (exibição na agenda e reservas)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'court_images',
  'court_images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Court images públicos - leitura" ON storage.objects;
CREATE POLICY "Court images públicos - leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'court_images');

DROP POLICY IF EXISTS "Court images - upload autenticado" ON storage.objects;
CREATE POLICY "Court images - upload autenticado"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'court_images'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Court images - atualização autenticada" ON storage.objects;
CREATE POLICY "Court images - atualização autenticada"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'court_images'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Court images - exclusão autenticada" ON storage.objects;
CREATE POLICY "Court images - exclusão autenticada"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'court_images'
  AND auth.role() = 'authenticated'
);
