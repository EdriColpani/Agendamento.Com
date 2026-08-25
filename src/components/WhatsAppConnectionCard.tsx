import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Smartphone, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import {
  callWhatsAppEvolutionInstance,
  formatInstanceDate,
  formatWhatsAppPhone,
  normalizeQrImageSrc,
  WhatsAppInstance,
  WhatsAppInstanceStatus,
} from '@/utils/whatsappEvolutionApi';

type QrPayload = {
  qr?: string | null;
  pairingCode?: string | null;
};

function applyQrPayload(
  data: QrPayload,
  setQrSrc: (v: string | null) => void,
  setPairingCode: (v: string | null) => void,
) {
  const img = normalizeQrImageSrc(data.qr);
  if (img) {
    setQrSrc(img);
    setPairingCode(null);
  } else if (data.qr) {
    setQrSrc(null);
    setPairingCode(data.qr);
  } else if (data.pairingCode) {
    setQrSrc(null);
    setPairingCode(data.pairingCode);
  }
}

interface WhatsAppConnectionCardProps {
  companyId: string | null;
  disabled?: boolean;
}

const STATUS_LABEL: Record<WhatsAppInstanceStatus, string> = {
  CONNECTED: 'Conectado',
  CONNECTING: 'Conectando',
  DISCONNECTED: 'Não conectado',
  ERROR: 'Erro',
};

function statusBadgeClass(status: WhatsAppInstanceStatus): string {
  switch (status) {
    case 'CONNECTED':
      return 'bg-green-600 hover:bg-green-600';
    case 'CONNECTING':
      return 'bg-amber-500 hover:bg-amber-500';
    case 'ERROR':
      return 'bg-red-600 hover:bg-red-600';
    default:
      return 'bg-gray-500 hover:bg-gray-500';
  }
}

function statusIcon(status: WhatsAppInstanceStatus) {
  if (status === 'CONNECTED') return <Wifi className="h-4 w-4" />;
  if (status === 'ERROR') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'CONNECTING') return <Loader2 className="h-4 w-4 animate-spin" />;
  return <WifiOff className="h-4 w-4" />;
}

export const WhatsAppConnectionCard: React.FC<WhatsAppConnectionCardProps> = ({
  companyId,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const applyInstance = useCallback((row: WhatsAppInstance | null | undefined) => {
    setInstance(row ?? null);
    if (row?.status === 'CONNECTED') {
      setQrSrc(null);
      setPairingCode(null);
      clearPolling();
    }
  }, [clearPolling]);

  const refreshStatus = useCallback(async (syncEvolution = false) => {
    if (!companyId) return;
    const action = syncEvolution ? 'sync_status' : 'get';
    const data = await callWhatsAppEvolutionInstance(action, companyId);
    applyInstance(data.instance ?? null);
    return data.instance ?? null;
  }, [companyId, applyInstance]);

  const loadInitial = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await callWhatsAppEvolutionInstance('ensure', companyId);
      const row = await refreshStatus(false);
      if (row?.status === 'CONNECTING') {
        try {
          const qrData = await callWhatsAppEvolutionInstance('get_qr', companyId);
          applyQrPayload(qrData, setQrSrc, setPairingCode);
        } catch {
          /* QR pode expirar; usuário pode regerar */
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar conexão WhatsApp.';
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, refreshStatus]);

  useEffect(() => {
    loadInitial();
    return () => clearPolling();
  }, [loadInitial, clearPolling]);

  useEffect(() => {
    clearPolling();
    if (!companyId || instance?.status !== 'CONNECTING') return;

    pollingRef.current = setInterval(async () => {
      try {
        const row = await refreshStatus(true);
        if (row?.status === 'CONNECTED') {
          showSuccess('WhatsApp conectado com sucesso!');
        }
      } catch {
        /* polling silencioso */
      }
    }, 3000);

    return () => clearPolling();
  }, [companyId, instance?.status, refreshStatus, clearPolling]);

  const handleConnect = async () => {
    if (!companyId || disabled) return;
    setBusy(true);
    setQrSrc(null);
    setPairingCode(null);
    try {
      await callWhatsAppEvolutionInstance('ensure', companyId);
      const data = await callWhatsAppEvolutionInstance('get_qr', companyId);
      applyQrPayload(data, setQrSrc, setPairingCode);
      applyInstance({
        ...(instance ?? {
          id: '',
          company_id: companyId,
          instance_name: data.instance_name ?? '',
          provider: 'evolution',
          connected_phone: null,
          connected_at: null,
          last_activity_at: null,
          last_disconnected_at: null,
          last_error: null,
        }),
        status: 'CONNECTING',
        instance_name: data.instance_name ?? instance?.instance_name ?? '',
      } as WhatsAppInstance);
      if (!normalizeQrImageSrc(data.qr) && !data.qr && !data.pairingCode) {
        showError('QR Code não retornado. Tente novamente ou verifique a Evolution API.');
      }
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao iniciar conexão.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!companyId) return;
    setBusy(true);
    try {
      const data = await callWhatsAppEvolutionInstance('disconnect', companyId);
      applyInstance(data.instance ?? null);
      setQrSrc(null);
      setPairingCode(null);
      showSuccess('WhatsApp desconectado.');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao desconectar.');
    } finally {
      setBusy(false);
      setDisconnectOpen(false);
    }
  };

  const currentStatus: WhatsAppInstanceStatus = instance?.status ?? 'DISCONNECTED';

  if (!companyId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Selecione uma empresa para configurar o WhatsApp.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Conexão WhatsApp
              </CardTitle>
              <CardDescription className="mt-1">
                Conecte o WhatsApp da sua empresa para enviar lembretes automáticos (Evolution Community).
              </CardDescription>
            </div>
            <Badge className={`gap-1 ${statusBadgeClass(currentStatus)}`}>
              {statusIcon(currentStatus)}
              {STATUS_LABEL[currentStatus]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentStatus === 'DISCONNECTED' && (
            <div className="rounded-lg border border-dashed p-6 text-center space-y-4">
              <p className="text-muted-foreground">
                Status: não conectado. Clique abaixo para gerar o QR Code e vincular seu WhatsApp.
              </p>
              <Button
                onClick={handleConnect}
                disabled={disabled || busy}
                className="bg-[#25D366] hover:bg-[#20bd5a] text-white"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Conectar WhatsApp
              </Button>
            </div>
          )}

          {currentStatus === 'CONNECTING' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> →{' '}
                <strong>Conectar um aparelho</strong> e escaneie o código abaixo.
              </p>
              {(qrSrc || pairingCode) && (
                <div className="flex flex-col items-center gap-3">
                  {qrSrc ? (
                    <img
                      src={qrSrc}
                      alt="QR Code WhatsApp"
                      className="w-64 h-64 border rounded-lg bg-white p-2"
                    />
                  ) : (
                    <div className="rounded-lg border bg-muted p-4 text-center max-w-md">
                      <p className="text-xs text-muted-foreground mb-2">Código de pareamento</p>
                      <p className="font-mono text-sm break-all">{pairingCode}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Aguardando leitura do QR Code…
                  </p>
                </div>
              )}
              {!qrSrc && !pairingCode && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={handleConnect} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Gerar QR Code novamente
                  </Button>
                </div>
              )}
            </div>
          )}

          {currentStatus === 'CONNECTED' && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Número conectado:</span>
                  <p className="font-medium">{formatWhatsAppPhone(instance?.connected_phone)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Instância:</span>
                  <p className="font-mono text-xs break-all">{instance?.instance_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Conectado em:</span>
                  <p>{formatInstanceDate(instance?.connected_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Última atividade:</span>
                  <p>{formatInstanceDate(instance?.last_activity_at)}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setDisconnectOpen(true)}
                disabled={disabled || busy}
              >
                Desconectar WhatsApp
              </Button>
            </div>
          )}

          {currentStatus === 'ERROR' && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                {instance?.last_error || 'Ocorreu um erro na conexão WhatsApp.'}
              </p>
              <Button onClick={handleConnect} disabled={disabled || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Tentar conectar novamente
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground border-t pt-3">
            Integração via Evolution API Community (self-hosted). Credenciais permanecem no servidor;
            nenhuma chave é exposta no navegador.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Os lembretes automáticos deixarão de ser enviados por este número até reconectar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDisconnect();
              }}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default WhatsAppConnectionCard;
