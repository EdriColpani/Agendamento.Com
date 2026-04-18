import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// Zod schema for area de atuacao
const areaDeAtuacaoSchema = z.object({
  name: z.string().min(1, "O nome da área de atuação é obrigatório."),
});

type AreaDeAtuacaoFormValues = z.infer<typeof areaDeAtuacaoSchema>;

interface AreaDeAtuacao {
  id: string;
  name: string;
  created_at: string;
}

const AreaDeAtuacaoPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [areas, setAreas] = useState<AreaDeAtuacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaDeAtuacao | null>(null);
  const [areaToDelete, setAreaToDelete] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AreaDeAtuacaoFormValues>({
    resolver: zodResolver(areaDeAtuacaoSchema),
    defaultValues: {
      name: '',
    },
  });

  const fetchAreas = useCallback(async () => {
    if (!session?.user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('area_de_atuacao')
      .select(`
        id, 
        name, 
        created_at
      `)
      .order('name', { ascending: true });

    if (error) {
      showError('Erro ao carregar áreas de atuação: ' + error.message);
      console.error('Error fetching areas:', error);
    } else if (data) {
      setAreas(data as AreaDeAtuacao[]);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  const handleAddArea = () => {
    setEditingArea(null);
    reset({ name: '' });
    setIsFormModalOpen(true);
  };

  const handleEditArea = (area: AreaDeAtuacao) => {
    setEditingArea(area);
    reset({ name: area.name });
    setIsFormModalOpen(true);
  };

  const handleDeleteClick = (areaId: string) => {
    setAreaToDelete(areaId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (areaToDelete && session?.user) {
      setLoading(true);
      const { error } = await supabase
        .from('area_de_atuacao')
        .delete()
        .eq('id', areaToDelete); 

      if (error) {
        showError('Erro ao excluir área de atuação: ' + error.message);
        console.error('Error deleting area:', error);
      } else {
        showSuccess('Área de atuação excluída com sucesso!');
        fetchAreas();
      }
      setLoading(false);
      setIsDeleteDialogOpen(false);
      setAreaToDelete(null);
    }
  };

  const onSubmit = async (data: AreaDeAtuacaoFormValues) => {
    setLoading(true);
    if (!session?.user) {
      showError('Você precisa estar logado para gerenciar áreas de atuação.');
      setLoading(false);
      return;
    }

    let error;
    const payload = {
      name: data.name,
      user_id: session.user.id,
    };

    if (editingArea) {
      // Update existing area
      const { error: updateError } = await supabase
        .from('area_de_atuacao')
        .update(payload)
        .eq('id', editingArea.id);
      error = updateError;
    } else {
      // Insert new area
      const { error: insertError } = await supabase
        .from('area_de_atuacao')
        .insert(payload);
      error = insertError;
    }

    if (error) {
      showError('Erro ao ' + (editingArea ? 'atualizar' : 'cadastrar') + ' área de atuação: ' + error.message);
      console.error('Error saving area:', error);
    } else {
      showSuccess('Área de atuação ' + (editingArea ? 'atualizada' : 'cadastrada') + ' com sucesso!');
      fetchAreas();
      setIsFormModalOpen(false);
    }
    setLoading(false);
  };

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para gerenciar áreas de atuação.</p>
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
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Áreas de Atuação</h1>
      </div>

      <div className="max-w-4xl space-y-6">
        <Card className="border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-gray-900">Áreas de Atuação</CardTitle>
            <Button
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddArea}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Nova Área
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-gray-700">Carregando áreas de atuação...</p>
            ) : areas.length === 0 ? (
              <p className="text-gray-600">Nenhuma área de atuação cadastrada ainda. Clique em "Nova Área" para começar.</p>
            ) : (
              <div className="space-y-3">
                {areas.map((area) => (
                  <div key={area.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                        <Zap className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-gray-900">{area.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => handleEditArea(area)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => handleDeleteClick(area.id)}
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

      {/* Form Modal for Add/Edit Area */}
      <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Editar Área de Atuação' : 'Nova Área de Atuação'}</DialogTitle>
            <DialogDescription>
              {editingArea ? 'Altere o nome da área.' : 'Adicione uma nova área de atuação.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
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
              Tem certeza que deseja excluir esta área de atuação? Esta ação não pode ser desfeita.
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

export default AreaDeAtuacaoPage;