import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showError, showSuccess } from '@/utils/toast';
import {
  fetchArenaLoginMarketingPublic,
  uploadArenaLoginMarketingSlot,
  clearArenaLoginMarketingSlot,
} from '@/services/arenaLoginMarketingService';

const SLOTS = [1, 2, 3, 4] as const;

const ArenaLoginMarketingPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<(string | null)[]>([null, null, null, null]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchArenaLoginMarketingPublic();
      if (row) {
        setUrls([row.image_url_1, row.image_url_2, row.image_url_3, row.image_url_4]);
        setUpdatedAt(row.updated_at);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao carregar imagens: ' + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (slot: 1 | 2 | 3 | 4, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Selecione um arquivo de imagem (JPEG, PNG, WebP ou GIF).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError('Imagem muito grande. Máximo 5 MB.');
      return;
    }
    setUploadingSlot(slot);
    try {
      const url = await uploadArenaLoginMarketingSlot(slot, file);
      setUrls((prev) => {
        const next = [...prev];
        next[slot - 1] = url;
        return next;
      });
      showSuccess(`Imagem do quadro ${slot} atualizada.`);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Falha no envio: ' + msg);
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleClear = async (slot: 1 | 2 | 3 | 4) => {
    setUploadingSlot(slot);
    try {
      await clearArenaLoginMarketingSlot(slot);
      setUrls((prev) => {
        const next = [...prev];
        next[slot - 1] = null;
        return next;
      });
      showSuccess(`Quadro ${slot} limpo.`);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao remover: ' + msg);
    } finally {
      setUploadingSlot(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin-dashboard')} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Imagens do login Arena</h1>
          <p className="mt-1 text-muted-foreground">
            As quatro imagens aparecem no painel esquerdo da página pública <strong>/arena</strong> (antes do login).
            Apenas administradores globais podem alterar.
          </p>
          {updatedAt && (
            <p className="mt-2 text-xs text-muted-foreground">Última atualização: {new Date(updatedAt).toLocaleString('pt-BR')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <Card key={slot}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImageIcon className="h-5 w-5" />
                Quadro {slot}
              </CardTitle>
              <CardDescription>Proporção sugerida 4:3. Máx. 5 MB.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                {urls[slot - 1] ? (
                  <img
                    src={urls[slot - 1]!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem imagem</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={`arena-login-file-${slot}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={uploadingSlot !== null}
                  onChange={(e) => {
                    void handleFile(slot, e.target.files);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={uploadingSlot !== null}
                  onClick={() => document.getElementById(`arena-login-file-${slot}`)?.click()}
                >
                  {uploadingSlot === slot ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Enviar imagem
                </Button>
                {urls[slot - 1] && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingSlot !== null}
                    onClick={() => void handleClear(slot)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ArenaLoginMarketingPage;
