import React, { useState, useEffect, useCallback } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Loader2, Copy, Image as ImageIcon, Edit, Trash2, CreditCard } from "lucide-react";
import { toast } from 'sonner';
import { useSession } from '@/components/SessionContextProvider';
import { useIsProprietario } from '@/hooks/useIsProprietario';
import { useIsCompanyAdmin } from '@/hooks/useIsCompanyAdmin';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { BannerFormModal } from '@/components/BannerFormModal';
import { getBannerByCompanyId, deleteBanner, type Banner } from '@/services/bannerService';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Separator } from "@/components/ui/separator";
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

type MpCredentialRow = {
  provider: string;
  is_active: boolean;
  last_validated_at: string | null;
  validation_error: string | null;
  provider_account_id: string | null;
  updated_at: string | null;
};

function parseEdgeInvokeError(response: { error?: { message?: string; context?: { data?: unknown } }; data?: unknown }): string {
  if (response.error) {
    const ctx = response.error.context?.data;
    if (typeof ctx === 'string') {
      try {
        const parsed = JSON.parse(ctx) as { error?: string };
        return parsed.error || response.error.message || 'Erro na Edge Function.';
      } catch {
        return ctx || response.error.message || 'Erro na Edge Function.';
      }
    }
    if (ctx && typeof ctx === 'object' && ctx !== null && 'error' in ctx) {
      return String((ctx as { error?: string }).error || response.error.message || 'Erro na Edge Function.');
    }
    return response.error.message || 'Erro na Edge Function.';
  }
  if (response.data && typeof response.data === 'object' && response.data !== null && 'error' in response.data) {
    return String((response.data as { error?: string }).error || 'Erro na Edge Function.');
  }
  return 'Erro na Edge Function.';
}

const ConfigPage: React.FC = () => {
  const { session } = useSession();
  const { isProprietario, loadingProprietarioCheck } = useIsProprietario();
  const { isCompanyAdmin, loadingCompanyAdminCheck } = useIsCompanyAdmin();
  const { settings, loading, isSaving, updateSettings } = useCompanySettings();
  const { primaryCompanyId } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const [requireClientRegistration, setRequireClientRegistration] = useState(false);
  const [guestAppointmentLink, setGuestAppointmentLink] = useState("");
  
  // Estados para gerenciamento de banner
  const [currentBanner, setCurrentBanner] = useState<Banner | null>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [bannerToDelete, setBannerToDelete] = useState<string | null>(null);

  const canManageCompanyPayments =
    !loadingProprietarioCheck && !loadingCompanyAdminCheck && (isProprietario || isCompanyAdmin);

  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpRows, setMpRows] = useState<MpCredentialRow[]>([]);
  const [mpLoadingStatus, setMpLoadingStatus] = useState(false);
  const [mpSaving, setMpSaving] = useState(false);

  const fetchPaymentCredentialsStatus = useCallback(async () => {
    if (!primaryCompanyId || !session?.access_token) return;
    setMpLoadingStatus(true);
    try {
      const response = await supabase.functions.invoke('upsert-company-payment-credentials', {
        body: JSON.stringify({
          action: 'status',
          company_id: primaryCompanyId,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (response.error || (response.data && typeof response.data === 'object' && 'error' in response.data)) {
        throw new Error(parseEdgeInvokeError(response));
      }
      const payload = response.data as { data?: MpCredentialRow[] };
      setMpRows(Array.isArray(payload?.data) ? payload.data : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar status de pagamentos.';
      showError(msg);
    } finally {
      setMpLoadingStatus(false);
    }
  }, [primaryCompanyId, session?.access_token]);

  useEffect(() => {
    if (canManageCompanyPayments && primaryCompanyId && session?.access_token) {
      fetchPaymentCredentialsStatus();
    }
  }, [canManageCompanyPayments, primaryCompanyId, session?.access_token, fetchPaymentCredentialsStatus]);

  const handleSaveMercadoPagoToken = async () => {
    if (!primaryCompanyId || !session?.access_token) {
      showError('Sessão ou empresa não disponível.');
      return;
    }
    const trimmed = mpAccessToken.trim();
    if (!trimmed) {
      showError('Informe o access token do Mercado Pago.');
      return;
    }
    setMpSaving(true);
    try {
      const response = await supabase.functions.invoke('upsert-company-payment-credentials', {
        body: JSON.stringify({
          action: 'upsert',
          company_id: primaryCompanyId,
          provider: 'mercadopago',
          credentials: { access_token: trimmed },
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (response.error || (response.data && typeof response.data === 'object' && 'error' in response.data)) {
        throw new Error(parseEdgeInvokeError(response));
      }
      showSuccess('Credenciais validadas e salvas com segurança no servidor.');
      setMpAccessToken('');
      await fetchPaymentCredentialsStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar credenciais.';
      showError(msg);
    } finally {
      setMpSaving(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setRequireClientRegistration(settings.require_client_registration);
      setGuestAppointmentLink(settings.guest_appointment_link || "");
    }
  }, [settings]);

  // Função para buscar banner atual
  const fetchCurrentBanner = useCallback(async () => {
    if (!primaryCompanyId) return;
    
    setBannerLoading(true);
    try {
      const banner = await getBannerByCompanyId(primaryCompanyId);
      setCurrentBanner(banner);
    } catch (error: any) {
      console.error('Erro ao buscar banner:', error);
      // Não mostrar erro se simplesmente não houver banner
      if (error.message && !error.message.includes('PGRST116')) {
        showError('Erro ao carregar banner: ' + error.message);
      }
    } finally {
      setBannerLoading(false);
    }
  }, [primaryCompanyId]);

  useEffect(() => {
    if (!primaryCompanyId) return;
    supabase
      .from('companies')
      .select('name')
      .eq('id', primaryCompanyId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setCompanyName(data.name);
        }
      });
  }, [primaryCompanyId]);

  useEffect(() => {
    if (!primaryCompanyId || loadingSchedulingMode || isCourtMode) return;

    const baseUrl = window.location.origin;
    const generatedLink = `${baseUrl}/guest-appointment/${primaryCompanyId}`;
    if (guestAppointmentLink === "" || (settings && settings.guest_appointment_link !== generatedLink)) {
      setGuestAppointmentLink(generatedLink);
    }

    fetchCurrentBanner();
  }, [
    primaryCompanyId,
    settings,
    guestAppointmentLink,
    fetchCurrentBanner,
    isCourtMode,
    loadingSchedulingMode,
  ]);

  // Função para excluir banner
  const handleDeleteBanner = async () => {
    if (!bannerToDelete) return;

    try {
      await deleteBanner(bannerToDelete);
      showSuccess('Banner excluído com sucesso!');
      setCurrentBanner(null);
      setBannerToDelete(null);
    } catch (error: any) {
      console.error('Erro ao excluir banner:', error);
      showError('Erro ao excluir banner: ' + error.message);
    }
  };

  const handleSave = async () => {
    await updateSettings({
      require_client_registration: requireClientRegistration,
      guest_appointment_link: guestAppointmentLink,
    });
  };

  const handleCopyLink = () => {
    if (guestAppointmentLink) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        console.log('Attempting to copy link using navigator.clipboard:', guestAppointmentLink);
        navigator.clipboard.writeText(guestAppointmentLink)
          .then(() => {
            toast.success("Link copiado para a área de transferência!");
          })
          .catch(err => {
            console.error('Failed to copy link using navigator.clipboard, falling back:', err);
            fallbackCopyTextToClipboard(guestAppointmentLink);
          });
      } else {
        console.log('navigator.clipboard not available, falling back:', guestAppointmentLink);
        fallbackCopyTextToClipboard(guestAppointmentLink);
      }
    } else {
      toast.error("Nenhum link para copiar.");
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";  // Evita que a rolagem aconteça
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      toast.success("Link copiado para a área de transferência! (Fallback)");
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
      toast.error("Falha ao copiar o link usando fallback.");
    }
    document.body.removeChild(textArea);
  };

  if (loading || (primaryCompanyId != null && loadingSchedulingMode)) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-600" />
        <p className="ml-2 text-gray-600">Carregando configurações...</p>
      </div>
    );
  }

  const pageTitle = isCourtMode ? 'Configurações — Arena' : 'Configurações da Empresa';
  const pageSubtitle = isCourtMode
    ? 'Pagamentos online (Mercado Pago) para recebimentos do módulo de quadras.'
    : 'Banner, link de convidados e opções gerais da empresa.';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
        <p className="text-sm text-gray-600 mt-2">{pageSubtitle}</p>
      </div>

      <div className="space-y-6">
        {isCourtMode ? (
          <>
            {primaryCompanyId && canManageCompanyPayments ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Pagamentos online (Mercado Pago)
                  </CardTitle>
                  <CardDescription className="mt-1">
                    O token é enviado apenas para o servidor, validado no Mercado Pago e armazenado cifrado.
                    Ele não fica salvo no navegador após salvar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mpLoadingStatus ? (
                    <div className="flex items-center text-sm text-gray-600">
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-yellow-600" />
                      Carregando status…
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 space-y-1">
                      {mpRows.length === 0 ? (
                        <p>Nenhuma credencial de recebimento configurada para esta empresa.</p>
                      ) : (
                        mpRows.map((row) => (
                          <p key={row.provider}>
                            <strong>{row.provider}</strong>
                            {': '}
                            {row.is_active ? 'ativo' : 'inativo'}
                            {row.last_validated_at
                              ? ` — validado em ${new Date(row.last_validated_at).toLocaleString('pt-BR')}`
                              : ''}
                            {row.provider_account_id ? ` — conta MP #${row.provider_account_id}` : ''}
                          </p>
                        ))
                      )}
                    </div>
                  )}
                  <div className="grid w-full max-w-lg items-center gap-1.5">
                    <Label htmlFor="mpAccessToken">Access token (OAuth vendedor)</Label>
                    <Input
                      id="mpAccessToken"
                      type="password"
                      autoComplete="off"
                      placeholder="Cole o token uma vez para gravar no servidor"
                      value={mpAccessToken}
                      onChange={(e) => setMpAccessToken(e.target.value)}
                      disabled={mpSaving}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleSaveMercadoPagoToken}
                    disabled={mpSaving || mpLoadingStatus}
                    variant="outline"
                    className="border-yellow-600 text-yellow-900 hover:bg-yellow-50"
                  >
                    {mpSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Validar e salvar no servidor
                  </Button>
                </CardContent>
              </Card>
            ) : primaryCompanyId ? (
              <Card>
                <CardHeader>
                  <CardTitle>Acesso restrito</CardTitle>
                  <CardDescription>
                    Somente Proprietário ou Admin da empresa pode configurar pagamentos online da arena.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Empresa não selecionada</CardTitle>
                  <CardDescription>Selecione uma empresa para configurar os pagamentos da arena.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </>
        ) : (
          <>
        {/* Seção de Banner */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Banner da Empresa
                </CardTitle>
                <CardDescription className="mt-1">
                  Gerencie o banner da sua empresa. Cada empresa pode ter apenas 1 banner.
                </CardDescription>
              </div>
              {primaryCompanyId && (
                <Button
                  onClick={() => setIsBannerModalOpen(true)}
                  variant={currentBanner ? "outline" : "default"}
                >
                  {currentBanner ? (
                    <>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar Banner
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Criar Banner
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {bannerLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-600" />
                <p className="ml-2 text-gray-600">Carregando banner...</p>
              </div>
            ) : currentBanner ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between p-4 border rounded-lg bg-gray-50">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{currentBanner.title}</h3>
                    {currentBanner.description && (
                      <p className="text-sm text-gray-600 mb-3">{currentBanner.description}</p>
                    )}
                    <div className="space-y-1 text-sm text-gray-500">
                      <p><strong>URL da Imagem:</strong> {currentBanner.image_url}</p>
                      {currentBanner.link_url && (
                        <p><strong>Link de Destino:</strong> {currentBanner.link_url}</p>
                      )}
                      <p><strong>Status:</strong> {currentBanner.is_active ? 'Ativo' : 'Inativo'}</p>
                      <p><strong>Ordem:</strong> {currentBanner.display_order}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsBannerModalOpen(true)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setBannerToDelete(currentBanner.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ImageIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="mb-4">Nenhum banner cadastrado ainda.</p>
                {primaryCompanyId && (
                  <Button
                    onClick={() => setIsBannerModalOpen(true)}
                    variant="outline"
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Criar Primeiro Banner
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Seção de Configurações Gerais */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações Gerais</CardTitle>
            <CardDescription>
              Configure as opções gerais da sua empresa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Checkbox para require_client_registration */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="requireClientRegistration"
                checked={requireClientRegistration}
                onCheckedChange={(checked) => setRequireClientRegistration(checked as boolean)}
                disabled={isSaving}
              />
              <Label htmlFor="requireClientRegistration" className="text-base">
                Exigir registro de cliente antes do agendamento
              </Label>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Se esta opção estiver ativada, os clientes precisarão ter um cadastro na sua empresa antes de poderem realizar um agendamento. Isso garante que você tenha as informações básicas do cliente desde o primeiro contato.
            </p>

            {/* Campo de texto para o link de agendamento para convidados */}
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="guestAppointmentLink">Link de Agendamento para Convidados</Label>
              <div className="flex space-x-2">
                <Input
                  type="url"
                  id="guestAppointmentLink"
                  placeholder="Link será gerado automaticamente"
                  value={guestAppointmentLink}
                  onChange={(e) => setGuestAppointmentLink(e.target.value)}
                  disabled={isSaving || !primaryCompanyId}
                />
                <Button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={isSaving || !guestAppointmentLink}
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-gray-500">Este link pode ser compartilhado com clientes para agendamentos sem necessidade de cadastro. Será preenchido automaticamente com o código da sua empresa.</p>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-yellow-600 hover:bg-yellow-700 text-black !rounded-button"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Salvar Configurações
            </Button>
          </CardContent>
        </Card>
          </>
        )}
      </div>

      {/* Modal de Formulário de Banner (somente fluxo não-arena) */}
      {primaryCompanyId && !isCourtMode && (
        <BannerFormModal
          open={isBannerModalOpen}
          onClose={() => {
            setIsBannerModalOpen(false);
          }}
          companyId={primaryCompanyId}
          companyName={companyName}
          onSuccess={() => {
            fetchCurrentBanner();
          }}
        />
      )}

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog
        open={!!bannerToDelete}
        onOpenChange={(open) => !open && setBannerToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este banner? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBanner} className="bg-red-500">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConfigPage;







