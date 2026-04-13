import React, { useState, useEffect, useCallback } from 'react';
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
import { ArrowLeft, Edit, PlusCircle, Trash2 } from 'lucide-react';

const courtFormSchema = z.object({
  name: z.string().min(1, 'Nome da quadra é obrigatório.'),
  description: z.string().optional(),
  display_order: z.coerce.number().int().min(0),
  slot_duration_minutes: z.coerce.number().int().min(15).max(1440),
  /** Valor cobrado por slot (bloco); usado na reserva pública e no total_price ao reservar. */
  default_slot_price: z.coerce.number().min(0, 'Valor não pode ser negativo.'),
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
  created_at: string;
}

const CourtsManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);
  const [courts, setCourts] = useState<CourtRow[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourt, setEditingCourt] = useState<CourtRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      display_order: 0,
      slot_duration_minutes: 60,
      default_slot_price: 0,
      is_active: true,
    },
  });

  const isActiveValue = watch('is_active');

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
        'id, company_id, name, description, is_active, display_order, slot_duration_minutes, default_slot_price, created_at',
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
      display_order: courts.length,
      slot_duration_minutes: 60,
      default_slot_price: 0,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (court: CourtRow) => {
    setEditingCourt(court);
    reset({
      name: court.name,
      description: court.description || '',
      display_order: court.display_order,
      slot_duration_minutes: court.slot_duration_minutes ?? 60,
      default_slot_price: court.default_slot_price ?? 0,
      is_active: court.is_active,
    });
    setModalOpen(true);
  };

  const onSubmit = async (values: CourtFormValues) => {
    if (!session?.user || !primaryCompanyId) return;
    setSaving(true);
    const payload = {
      company_id: primaryCompanyId,
      name: values.name.trim(),
      description: values.description?.trim() || null,
      display_order: values.display_order,
      slot_duration_minutes: values.slot_duration_minutes,
      default_slot_price: values.default_slot_price,
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
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" className="!rounded-button" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quadras</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="!rounded-button" asChild>
            <Link to="/quadras/horarios">Horários de funcionamento</Link>
          </Button>
          <Button variant="outline" size="sm" className="!rounded-button" asChild>
            <Link to="/quadras/agenda">Agenda do dia</Link>
          </Button>
          <Button variant="outline" size="sm" className="!rounded-button" asChild>
            <Link to="/quadras/reservas">Lista de reservas</Link>
          </Button>
          <Button variant="outline" size="sm" className="!rounded-button" asChild>
            <Link to="/quadras/precos">Preços por horário</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-gray-900 dark:text-white">Recursos (quadras)</CardTitle>
          <Button
            className="!rounded-button bg-yellow-600 hover:bg-yellow-700 text-black"
            onClick={openCreate}
          >
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
          <code className="block break-all rounded bg-white dark:bg-gray-900 px-2 py-1 text-xs border">
            {typeof window !== 'undefined'
              ? `${window.location.origin}/reservar-quadra/${primaryCompanyId}`
              : `/reservar-quadra/${primaryCompanyId}`}
          </code>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCourt ? 'Editar quadra' : 'Nova quadra'}</DialogTitle>
            <DialogDescription>
              Nome único por empresa. Slots padrão podem ser ajustados também em Horários de funcionamento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="court-name">Nome *</Label>
              <Input id="court-name" className="mt-1" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="court-desc">Descrição</Label>
              <Textarea id="court-desc" className="mt-1" rows={3} {...register('description')} />
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
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 text-black">
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
