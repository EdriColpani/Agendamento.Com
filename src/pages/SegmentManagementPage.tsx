import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SCHEDULING_MODES = ['service', 'court'] as const;
type SchedulingMode = (typeof SCHEDULING_MODES)[number];

// Zod schema for segment type
const segmentTypeSchema = z.object({
  name: z.string().min(1, "O nome do segmento é obrigatório."),
  area_de_atuacao_id: z.string().min(1, "A Área de Atuação é obrigatória."),
  scheduling_mode: z.enum(SCHEDULING_MODES, {
    errorMap: () => ({ message: "Selecione o modo de agendamento." }),
  }),
});

type SegmentTypeFormValues = z.infer<typeof segmentTypeSchema>;

interface AreaDeAtuacao {
  id: string;
  name: string;
}

interface SegmentType {
  id: string;
  name: string;
  area_de_atuacao_id: string | null;
  area_de_atuacao: { name: string } | null;
  scheduling_mode: SchedulingMode;
  created_at: string;
}

const SegmentManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [segments, setSegments] = useState<SegmentType[]>([]);
  const [areas, setAreas] = useState<AreaDeAtuacao[]>([]); // Novo estado para áreas
  const [loading, setLoading] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<SegmentType | null>(null);
  const [segmentToDelete, setSegmentToDelete] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SegmentTypeFormValues>({
    resolver: zodResolver(segmentTypeSchema),
    defaultValues: {
      name: '',
      area_de_atuacao_id: '',
      scheduling_mode: 'service',
    },
  });

  const areaDeAtuacaoIdValue = watch('area_de_atuacao_id');
  const schedulingModeValue = watch('scheduling_mode');

  const fetchAreas = useCallback(async () => {
    setLoadingAreas(true);
    const { data, error } = await supabase
      .from('area_de_atuacao')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      showError('Erro ao carregar áreas de atuação: ' + error.message);
      console.error('Error fetching areas:', error);
    } else if (data) {
      setAreas(data);
    }
    setLoadingAreas(false);
  }, []);

  const fetchSegments = useCallback(async () => {
    if (!session?.user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('segment_types')
      .select(`
        id, 
        name, 
        created_at, 
        area_de_atuacao_id,
        scheduling_mode,
        area_de_atuacao(name)
      `)
      .order('name', { ascending: true });

    if (error) {
      showError('Erro ao carregar segmentos: ' + error.message);
      console.error('Error fetching segments:', error);
    } else if (data) {
      const normalized = (data as Record<string, unknown>[]).map((row) => ({
        ...row,
        scheduling_mode:
          row.scheduling_mode === 'court' ? 'court' : 'service',
      })) as SegmentType[];
      setSegments(normalized);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchAreas();
    fetchSegments();
  }, [fetchAreas, fetchSegments]);

  const handleAddSegment = () => {
    setEditingSegment(null);
    reset({ name: '', area_de_atuacao_id: '', scheduling_mode: 'service' });
    setIsFormModalOpen(true);
  };

  const handleEditSegment = (segment: SegmentType) => {
    setEditingSegment(segment);
    reset({
      name: segment.name,
      area_de_atuacao_id: segment.area_de_atuacao_id || '',
      scheduling_mode: segment.scheduling_mode === 'court' ? 'court' : 'service',
    });
    setIsFormModalOpen(true);
  };

  const handleDeleteClick = (segmentId: string) => {
    setSegmentToDelete(segmentId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (segmentToDelete && session?.user) {
      setLoading(true);
      const { error } = await supabase
        .from('segment_types')
        .delete()
        .eq('id', segmentToDelete)
        .eq('user_id', session.user.id);

      if (error) {
        showError('Erro ao excluir segmento: ' + error.message);
        console.error('Error deleting segment:', error);
      } else {
        showSuccess('Segmento excluído com sucesso!');
        fetchSegments();
      }
      setLoading(false);
      setIsDeleteDialogOpen(false);
      setSegmentToDelete(null);
    }
  };

  const onSubmit = async (data: SegmentTypeFormValues) => {
    setLoading(true);
    if (!session?.user) {
      showError('Você precisa estar logado para gerenciar segmentos.');
      setLoading(false);
      return;
    }

    let error;
    const payload = {
      name: data.name,
      area_de_atuacao_id: data.area_de_atuacao_id,
      scheduling_mode: data.scheduling_mode,
      user_id: session.user.id,
    };

    if (editingSegment) {
      // Update existing segment
      const { error: updateError } = await supabase
        .from('segment_types')
        .update(payload)
        .eq('id', editingSegment.id)
        .eq('user_id', session.user.id);
      error = updateError;
    } else {
      // Insert new segment
      const { error: insertError } = await supabase
        .from('segment_types')
        .insert(payload);
      error = insertError;
    }

    if (error) {
      showError('Erro ao ' + (editingSegment ? 'atualizar' : 'cadastrar') + ' segmento: ' + error.message);
      console.error('Error saving segment:', error);
    } else {
      showSuccess('Segmento ' + (editingSegment ? 'atualizado' : 'cadastrado') + ' com sucesso!');
      fetchSegments();
      setIsFormModalOpen(false);
    }
    setLoading(false);
  };

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para gerenciar segmentos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Segmentos de Empresa</h1>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card className="border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-gray-900">Meus Segmentos</CardTitle>
            <Button
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddSegment}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo Segmento
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-gray-700">Carregando segmentos...</p>
            ) : segments.length === 0 ? (
              <p className="text-gray-600">Nenhum segmento cadastrado ainda. Clique em "Novo Segmento" para começar.</p>
            ) : (
              <div className="space-y-3">
                {segments.map((segment) => (
                  <div key={segment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex flex-col items-start gap-1">
                        <span className="font-medium text-gray-900">{segment.name}</span>
                        <span className="text-xs text-gray-600">Área: {segment.area_de_atuacao?.name || 'N/A'}</span>
                        <span
                          className={`text-xs font-medium rounded px-2 py-0.5 ${
                            segment.scheduling_mode === 'court'
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {segment.scheduling_mode === 'court'
                            ? 'Modo: Arena / quadras'
                            : 'Modo: Serviços (atendimento)'}
                        </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => handleEditSegment(segment)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => handleDeleteClick(segment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Form Modal for Add/Edit Segment */}
      <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingSegment ? 'Editar Segmento' : 'Novo Segmento'}</DialogTitle>
            <DialogDescription>
              {editingSegment
                ? 'Altere o nome, a área de atuação e o modo de agendamento. O modo define qual experiência o sistema usará para empresas deste segmento.'
                : 'Adicione um tipo de segmento, associe à área de atuação e defina o modo de agendamento (serviços ou arena/quadras).'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="area_de_atuacao_id" className="text-right">
                Área de Atuação *
              </Label>
              <Select onValueChange={(value) => setValue('area_de_atuacao_id', value, { shouldValidate: true })} value={areaDeAtuacaoIdValue}>
                <SelectTrigger id="area_de_atuacao_id" className="col-span-3" disabled={loadingAreas}>
                  <SelectValue placeholder={loadingAreas ? "Carregando áreas..." : "Selecione a área"} />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.area_de_atuacao_id && <p className="col-span-4 text-red-500 text-xs text-right">{errors.area_de_atuacao_id.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nome *
              </Label>
              <Input
                id="name"
                {...register('name')}
                className="col-span-3"
              />
              {errors.name && <p className="col-span-4 text-red-500 text-xs text-right">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="scheduling_mode" className="text-right pt-2">
                Modo de agenda *
              </Label>
              <div className="col-span-3 space-y-1">
                <Select
                  onValueChange={(value: SchedulingMode) =>
                    setValue('scheduling_mode', value, { shouldValidate: true })
                  }
                  value={schedulingModeValue}
                >
                  <SelectTrigger id="scheduling_mode">
                    <SelectValue placeholder="Selecione o modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Serviços (barbearia, clínica, etc.)</SelectItem>
                    <SelectItem value="court">Arena / quadras (horário por recurso)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Este valor orienta o sistema após o login do proprietário (em etapas futuras: dashboard e fluxos).
                </p>
                {errors.scheduling_mode && (
                  <p className="text-red-500 text-xs">{errors.scheduling_mode.message}</p>
                )}
              </div>
            </div>
            <DialogFooter className="flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormModalOpen(false)}
                className="!rounded-button whitespace-nowrap"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90">
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este segmento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={loading}>
              {loading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SegmentManagementPage;