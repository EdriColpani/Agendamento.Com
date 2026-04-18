import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Edit, PlusCircle, Trash2, Upload, X } from 'lucide-react';
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import ArenaToolbar from '@/components/arena/ArenaToolbar';
import { getArenaModuleLinks } from '@/components/arena/arenaNavConfig';

const courtFormSchema = z.object({
  name: z.string().min(1, 'Nome da quadra é obrigatório.'),
  description: z.string().optional(),
  image_url: z.union([z.literal(''), z.string().url('Informe uma URL válida.')]),
  display_order: z.coerce.number().int().min(0),
  slot_duration_minutes: z.coerce.number().int().min(15).max(1440),
  /** Valor cobrado por slot (bloco); usado na reserva pública e no total_price ao reservar. */
  default_slot_price: z.coerce.number().min(0, 'Valor não pode ser negativo.'),
  zip_code: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
  number: z.string().max(30).optional(),
  neighborhood: z.string().max(120).optional(),
  complement: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(30).optional(),
  is_active: z.boolean(),
});

type CourtFormValues = z.infer<typeof courtFormSchema>;

interface CourtRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  slot_duration_minutes?: number;
  default_slot_price?: number;
  image_url?: string | null;
  zip_code?: string | null;
  address?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  city?: string | null;
  state?: string | null;
  created_at: string;
}

const CourtsManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule, companyDetails } = useCourtBookingModule(primaryCompanyId);
  const monthlyPackagesEnabled = companyDetails?.court_enable_monthly_packages === true;
  const [courts, setCourts] = useState<CourtRow[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourt, setEditingCourt] = useState<CourtRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [courtImageTab, setCourtImageTab] = useState<'upload' | 'url'>('upload');
  const [courtImageFile, setCourtImageFile] = useState<File | null>(null);
  const [courtImagePreview, setCourtImagePreview] = useState<string | null>(null);
  const courtImageFileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CourtFormValues>({
    resolver: zodResolver(courtFormSchema),
    defaultValues: {
      name: '',
      description: '',
      image_url: '',
      display_order: 0,
      slot_duration_minutes: 60,
      default_slot_price: 0,
      zip_code: '',
      address: '',
      number: '',
      neighborhood: '',
      complement: '',
      city: '',
      state: '',
      is_active: true,
    },
  });

  const isActiveValue = watch('is_active');

  useEffect(() => {
    if (!modalOpen) {
      setCourtImageFile(null);
      setCourtImagePreview(null);
      setCourtImageTab('upload');
      if (courtImageFileInputRef.current) courtImageFileInputRef.current.value = '';
    }
  }, [modalOpen]);

  const uploadCourtImageToStorage = async (file: File, companyId: string): Promise<string> => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      throw new Error('Use JPG, PNG, WEBP ou GIF.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Imagem maior que 5MB.');
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const normalized = ext === 'jpeg' ? 'jpg' : ext;
    const safeExt = ['jpg', 'png', 'webp', 'gif'].includes(normalized) ? normalized : 'jpg';
    const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    const { error } = await supabase.storage.from('court_images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('court_images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleCourtImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showError('Imagem maior que 5MB.');
      e.target.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      showError('Formatos aceitos: JPG, PNG, WEBP e GIF.');
      e.target.value = '';
      return;
    }
    setCourtImageFile(file);
    setValue('image_url', '', { shouldValidate: true });
    const reader = new FileReader();
    reader.onloadend = () => setCourtImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearCourtImage = () => {
    setCourtImageFile(null);
    setValue('image_url', '', { shouldValidate: true });
    setCourtImagePreview(null);
    if (courtImageFileInputRef.current) courtImageFileInputRef.current.value = '';
  };

  const fetchCourts = useCallback(async () => {
    if (!primaryCompanyId || !session?.user) {
      setCourts([]);
      setLoadingCourts(false);
      return;
    }
    setLoadingCourts(true);
    const { data, error } = await supabase
      .from('courts')
      .select(
        'id, company_id, name, description, is_active, display_order, slot_duration_minutes, default_slot_price, image_url, zip_code, address, number, neighborhood, complement, city, state, created_at',
      )
      .eq('company_id', primaryCompanyId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      showError('Erro ao carregar quadras: ' + error.message);
      setCourts([]);
    } else {
      setCourts((data as CourtRow[]) || []);
    }
    setLoadingCourts(false);
  }, [primaryCompanyId, session?.user]);

  useEffect(() => {
    if (!loadingPrimaryCompany && !loadingSchedulingMode && !loadingArenaModule && isCourtMode && canUseArenaManagement) {
      fetchCourts();
    } else if (!loadingSchedulingMode && !loadingArenaModule && (!isCourtMode || !canUseArenaManagement)) {
      setLoadingCourts(false);
    }
  }, [fetchCourts, loadingPrimaryCompany, loadingSchedulingMode, loadingArenaModule, isCourtMode, canUseArenaManagement]);

  const openCreate = () => {
    setEditingCourt(null);
    reset({
      name: '',
      description: '',
      image_url: '',
      display_order: courts.length,
      slot_duration_minutes: 60,
      default_slot_price: 0,
      zip_code: '',
      address: '',
      number: '',
      neighborhood: '',
      complement: '',
      city: '',
      state: '',
      is_active: true,
    });
    setCourtImageFile(null);
    setCourtImagePreview(null);
    setCourtImageTab('upload');
    if (courtImageFileInputRef.current) courtImageFileInputRef.current.value = '';
    setModalOpen(true);
  };

  const openEdit = (court: CourtRow) => {
    setEditingCourt(court);
    reset({
      name: court.name,
      description: court.description || '',
      image_url: court.image_url || '',
      display_order: court.display_order,
      slot_duration_minutes: court.slot_duration_minutes ?? 60,
      default_slot_price: court.default_slot_price ?? 0,
      zip_code: court.zip_code || '',
      address: court.address || '',
      number: court.number || '',
      neighborhood: court.neighborhood || '',
      complement: court.complement || '',
      city: court.city || '',
      state: court.state || '',
      is_active: court.is_active,
    });
    setCourtImageFile(null);
    setCourtImagePreview(court.image_url?.trim() ? court.image_url : null);
    setCourtImageTab(court.image_url?.trim() ? 'url' : 'upload');
    if (courtImageFileInputRef.current) courtImageFileInputRef.current.value = '';
    setModalOpen(true);
  };

  const onSubmit = async (values: CourtFormValues) => {
    if (!session?.user || !primaryCompanyId) return;
    setSaving(true);
    let imageUrlFinal: string | null = values.image_url?.trim() || null;
    if (courtImageFile) {
      try {
        imageUrlFinal = await uploadCourtImageToStorage(courtImageFile, primaryCompanyId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao enviar a imagem.';
        showError(msg);
        setSaving(false);
        return;
      }
    }
    const payload = {
      company_id: primaryCompanyId,
      name: values.name.trim(),
      description: values.description?.trim() || null,
      image_url: imageUrlFinal,
      display_order: values.display_order,
      slot_duration_minutes: values.slot_duration_minutes,
      default_slot_price: values.default_slot_price,
      zip_code: values.zip_code?.replace(/\D/g, '') || null,
      address: values.address?.trim() || null,
      number: values.number?.trim() || null,
      neighborhood: values.neighborhood?.trim() || null,
      complement: values.complement?.trim() || null,
      city: values.city?.trim() || null,
      state: values.state?.trim() || null,
      is_active: values.is_active,
    };

    if (editingCourt) {
      const { error } = await supabase.from('courts').update(payload).eq('id', editingCourt.id);
      if (error) {
        showError('Erro ao atualizar quadra: ' + error.message);
      } else {
        showSuccess('Quadra atualizada.');
        setModalOpen(false);
        fetchCourts();
      }
    } else {
      const { error } = await supabase.from('courts').insert(payload);
      if (error) {
        if (error.code === '23505') {
          showError('Já existe uma quadra com esse nome nesta empresa.');
        } else {
          showError('Erro ao cadastrar quadra: ' + error.message);
        }
      } else {
        showSuccess('Quadra cadastrada.');
        setModalOpen(false);
        fetchCourts();
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setSaving(true);
    const { error } = await supabase.from('courts').delete().eq('id', deleteId);
    if (error) {
      showError('Erro ao excluir quadra: ' + error.message);
    } else {
      showSuccess('Quadra removida.');
      setDeleteId(null);
      fetchCourts();
    }
    setSaving(false);
  };

  const publicBookingLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/reservar-quadra/${primaryCompanyId}`
      : `/reservar-quadra/${primaryCompanyId}`;

  const handleCopyPublicLink = async () => {
    const fallbackCopy = (text: string) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, text.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      return copied;
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(publicBookingLink);
      } else {
        const copied = fallbackCopy(publicBookingLink);
        if (!copied) {
          throw new Error('Fallback de cópia falhou');
        }
      }
      showSuccess('Link copiado para a área de transferência.');
    } catch {
      showError('Não foi possível copiar o link automaticamente.');
    }
  };

  if (loadingPrimaryCompany || loadingSchedulingMode || loadingArenaModule) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700 dark:text-gray-300">Carregando...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 mb-4">É necessário ter uma empresa primária para gerenciar quadras.</p>
        <Button onClick={() => navigate('/register-company')}>Cadastrar empresa</Button>
      </div>
    );
  }

  if (!isCourtMode) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!canUseArenaManagement) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Módulo de quadras indisponível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <p>
              O módulo de reserva de quadras não está habilitado para o seu plano ou foi desativado na empresa. Use o
              dashboard ou fale com o suporte.
            </p>
            <Button className="!rounded-button" variant="outline" onClick={() => navigate('/dashboard')}>
              Voltar ao dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ArenaPageHeader
        title="Quadras"
        actions={
          <ArenaToolbar
            back={{ onClick: () => navigate('/dashboard'), label: 'Voltar' }}
            links={getArenaModuleLinks(monthlyPackagesEnabled)}
          />
        }
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-gray-900 dark:text-white">Recursos (quadras)</CardTitle>
          <Button className="rounded-full" onClick={openCreate}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Nova quadra
          </Button>
        </CardHeader>
        <CardContent>
          {loadingCourts ? (
            <p className="text-gray-600 dark:text-gray-400">Carregando quadras...</p>
          ) : courts.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              Nenhuma quadra cadastrada. Use &quot;Nova quadra&quot; para começar.
            </p>
          ) : (
            <ul className="space-y-3">
              {courts.map((court) => (
                <li
                  key={court.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">{court.name}</span>
                      <Badge variant={court.is_active ? 'default' : 'secondary'}>
                        {court.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        Ordem: {court.display_order} · Slot: {court.slot_duration_minutes ?? 60} min
                        {Number(court.default_slot_price) > 0
                          ? ` · R$ ${Number(court.default_slot_price).toFixed(2).replace('.', ',')} / slot`
                          : ''}
                      </span>
                    </div>
                    {court.description ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{court.description}</p>
                    ) : null}
                    {court.address || court.city || court.state ? (
                      <p className="text-xs text-gray-500 mt-1">
                        {[court.address, court.number, court.neighborhood, court.city, court.state]
                          .filter((item) => item && String(item).trim())
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(court)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteId(court.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="text-base text-gray-900 dark:text-white">Link público de reserva</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>Compartilhe com clientes para reservarem sem login (empresa em modo arena).</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <code className="block flex-1 break-all rounded bg-white dark:bg-gray-900 px-2 py-1 text-xs border">
              {publicBookingLink}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyPublicLink} className="w-full sm:w-auto">
              <Copy className="h-4 w-4 mr-2" />
              Copiar link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg flex max-h-[min(90vh,100dvh)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1.5 px-6 pt-6 pr-12 text-left">
            <DialogTitle>{editingCourt ? 'Editar quadra' : 'Nova quadra'}</DialogTitle>
            <DialogDescription>
              Nome único por empresa. Slots padrão podem ser ajustados também em Horários de funcionamento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            <div>
              <Label htmlFor="court-name">Nome *</Label>
              <Input id="court-name" className="mt-1" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="court-desc">Descrição</Label>
              <Textarea id="court-desc" className="mt-1" rows={3} {...register('description')} />
            </div>
            <div className="space-y-2">
              <Label>Imagem da quadra</Label>
              <Tabs
                value={courtImageTab}
                onValueChange={(v) => {
                  const tab = v as 'upload' | 'url';
                  setCourtImageTab(tab);
                  if (tab === 'url') {
                    setCourtImageFile(null);
                    if (courtImageFileInputRef.current) courtImageFileInputRef.current.value = '';
                    const u = watch('image_url')?.trim();
                    setCourtImagePreview(u ? u : null);
                  }
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload" type="button">
                    Enviar arquivo
                  </TabsTrigger>
                  <TabsTrigger value="url" type="button">
                    Usar URL
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="mt-3 space-y-2">
                  <input
                    ref={courtImageFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleCourtImageFileChange}
                    disabled={saving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => courtImageFileInputRef.current?.click()}
                    disabled={saving}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Selecionar imagem
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG, WEBP ou GIF — máx. 5MB</p>
                </TabsContent>
                <TabsContent value="url" className="mt-3 space-y-2">
                  <Input
                    id="court-image-url"
                    type="url"
                    className="mt-0"
                    placeholder="https://..."
                    {...register('image_url', {
                      onChange: (e) => {
                        setCourtImageFile(null);
                        if (courtImageFileInputRef.current) courtImageFileInputRef.current.value = '';
                        const v = e.target.value;
                        setCourtImagePreview(v.trim() ? v : null);
                      },
                    })}
                    disabled={saving}
                  />
                  {errors.image_url && <p className="text-xs text-red-500 mt-1">{errors.image_url.message}</p>}
                </TabsContent>
              </Tabs>
              {courtImagePreview && (
                <div className="relative mt-2 overflow-hidden rounded-lg border">
                  <img
                    src={courtImagePreview}
                    alt="Pré-visualização da quadra"
                    className="max-h-48 w-full object-contain bg-muted/30"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8 bg-background/90"
                    onClick={clearCourtImage}
                    disabled={saving}
                    aria-label="Remover imagem"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="court-zip-code">CEP</Label>
                <Input id="court-zip-code" className="mt-1" {...register('zip_code')} />
              </div>
              <div>
                <Label htmlFor="court-address-number">Número</Label>
                <Input id="court-address-number" className="mt-1" {...register('number')} />
              </div>
            </div>
            <div>
              <Label htmlFor="court-address">Endereço da arena/quadra</Label>
              <Input id="court-address" className="mt-1" {...register('address')} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="court-neighborhood">Bairro</Label>
                <Input id="court-neighborhood" className="mt-1" {...register('neighborhood')} />
              </div>
              <div>
                <Label htmlFor="court-city">Cidade</Label>
                <Input id="court-city" className="mt-1" {...register('city')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="court-state">Estado</Label>
                <Input id="court-state" className="mt-1" {...register('state')} />
              </div>
              <div>
                <Label htmlFor="court-complement">Complemento</Label>
                <Input id="court-complement" className="mt-1" {...register('complement')} />
              </div>
            </div>
            <div>
              <Label htmlFor="court-order">Ordem de exibição</Label>
              <Input id="court-order" type="number" min={0} className="mt-1" {...register('display_order')} />
              {errors.display_order && (
                <p className="text-xs text-red-500 mt-1">{errors.display_order.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="court-slot">Duração do slot (minutos)</Label>
              <Input
                id="court-slot"
                type="number"
                min={15}
                max={1440}
                className="mt-1"
                {...register('slot_duration_minutes')}
              />
              {errors.slot_duration_minutes && (
                <p className="text-xs text-red-500 mt-1">{errors.slot_duration_minutes.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="court-price">Valor por slot (R$)</Label>
              <Input
                id="court-price"
                type="number"
                min={0}
                step="0.01"
                className="mt-1"
                {...register('default_slot_price')}
              />
              <p className="text-xs text-gray-500 mt-1">
                Usado quando não há faixa em &quot;Preços por horário&quot; para aquele horário. Valor gravado em
                total_price na reserva (somando slots). Deixe 0 se ainda não cobrar.
              </p>
              {errors.default_slot_price && (
                <p className="text-xs text-red-500 mt-1">{errors.default_slot_price.message}</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <Label htmlFor="court-active">Quadra ativa</Label>
              <Switch
                id="court-active"
                checked={isActiveValue}
                onCheckedChange={(v) => setValue('is_active', v, { shouldValidate: true })}
              />
            </div>
            </div>
            <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir quadra?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. Agendamentos futuros vinculados podem ficar sem quadra.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourtsManagementPage;
