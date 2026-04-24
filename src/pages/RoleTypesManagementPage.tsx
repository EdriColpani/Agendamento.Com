import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showOperationError } from '@/utils/toast';
import { Loader2, ArrowLeft, UserCog, Edit, CheckCircle2, XCircle, Save, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RoleType {
  id: number;
  description: string;
  apresentar: boolean;
}

const RoleTypesManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [editingRoleType, setEditingRoleType] = useState<RoleType | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleTypeToDelete, setRoleTypeToDelete] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    description: '',
    apresentar: true,
  });

  useEffect(() => {
    fetchRoleTypes();
  }, []);

  const fetchRoleTypes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('role_types')
        .select('*')
        .order('description', { ascending: true });

      if (error) throw error;
      setRoleTypes(data || []);
    } catch (error: unknown) {
      showOperationError('Erro ao carregar tipos de perfil.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEdit = (roleType: RoleType) => {
    setEditingRoleType(roleType);
    setFormData({
      description: roleType.description,
      apresentar: roleType.apresentar,
    });
  };

  const handleCancelEdit = () => {
    setEditingRoleType(null);
    setFormData({
      description: '',
      apresentar: true,
    });
  };

  const handleSave = async () => {
    if (!formData.description.trim()) {
      showError('O nome do perfil é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      if (editingRoleType) {
        // Atualizar perfil existente
        const { error } = await supabase
          .from('role_types')
          .update({
            description: formData.description.trim(),
            apresentar: formData.apresentar,
          })
          .eq('id', editingRoleType.id);

        if (error) throw error;
        showSuccess('Perfil atualizado com sucesso!');
      } else {
        // Criar novo perfil
        const { error } = await supabase
          .from('role_types')
          .insert({
            description: formData.description.trim(),
            apresentar: formData.apresentar,
          });

        if (error) throw error;
        showSuccess('Perfil criado com sucesso!');
      }

      handleCancelEdit();
      fetchRoleTypes();
    } catch (error: unknown) {
      showOperationError('Erro ao salvar perfil.', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!roleTypeToDelete) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('role_types')
        .delete()
        .eq('id', roleTypeToDelete);

      if (error) throw error;
      showSuccess('Perfil excluído com sucesso!');
      setDeleteDialogOpen(false);
      setRoleTypeToDelete(null);
      fetchRoleTypes();
    } catch (error: unknown) {
      showOperationError('Erro ao excluir perfil.', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600 dark:text-gray-400" />
          <p className="text-gray-700 dark:text-gray-300">Carregando perfis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/admin-dashboard')}
              className="!rounded-button"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserCog className="h-8 w-8 text-blue-600" />
                Gestão de Perfis (Roles)
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Gerencie os tipos de cargos/perfis do sistema
              </p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-800">
          <CardHeader>
            <CardTitle>
              {editingRoleType ? 'Editar Perfil' : 'Novo Perfil'}
            </CardTitle>
            <CardDescription>
              {editingRoleType 
                ? 'Altere as informações do perfil abaixo' 
                : 'Preencha os dados para criar um novo perfil'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="description">Nome do Perfil *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Proprietário, Gerente, Colaborador"
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="apresentar">Apresentar?</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Controla se este perfil deve estar visível em outras partes do sistema
                </p>
              </div>
              <Switch
                id="apresentar"
                checked={formData.apresentar}
                onCheckedChange={(checked) => setFormData({ ...formData, apresentar: checked })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || !formData.description.trim()}
                className="!rounded-button bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {editingRoleType ? 'Atualizar' : 'Criar'}
                  </>
                )}
              </Button>
              {editingRoleType && (
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="!rounded-button"
                >
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* List Card */}
        <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-800">
          <CardHeader>
            <CardTitle>Perfis Cadastrados</CardTitle>
            <CardDescription>
              {roleTypes.length === 0 
                ? 'Nenhum perfil cadastrado' 
                : `${roleTypes.length} perfil(is) cadastrado(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {roleTypes.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <UserCog className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum perfil encontrado. Crie o primeiro perfil acima.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {roleTypes.map((roleType) => (
                  <Card key={roleType.id} className="border-gray-200 dark:border-gray-700">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">{roleType.description}</CardTitle>
                            {roleType.apresentar ? (
                              <Badge className="bg-green-500">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Visível
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <XCircle className="h-3 w-3 mr-1" />
                                Oculto
                              </Badge>
                            )}
                          </div>
                          <CardDescription>ID: {roleType.id}</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(roleType)}
                            disabled={!!editingRoleType}
                            className="!rounded-button"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRoleTypeToDelete(roleType.id);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={!!editingRoleType}
                            className="!rounded-button text-red-600 hover:text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este perfil? Esta ação não pode ser desfeita.
                <br />
                <strong className="text-red-600">
                  Atenção: Se este perfil estiver sendo usado por usuários, a exclusão pode causar problemas.
                </strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Excluir'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default RoleTypesManagementPage;

