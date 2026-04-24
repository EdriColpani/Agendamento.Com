import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createButton } from '@/lib/dashboard-utils';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showOperationError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Edit, Trash2, Clock, Briefcase, Shield } from 'lucide-react'; // Importar ícones
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"; // Importar componentes de diálogo
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Importar componentes de tooltip
import { PermissionsAlertModal } from '@/components/PermissionsAlertModal';
import { ALERT_KEYS, hasSeenAlert, markAlertAsSeen } from '@/utils/onboardingAlerts';

interface Collaborator {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  hire_date: string;
  role_type_id: number;
  commission_percentage: number;
  status: string;
  avatar_url: string | null;
  role_description?: string; // Adicionar para exibir a descrição da função
}

const ColaboradoresPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<string | null>(null);
  const [showPermissionsAlert, setShowPermissionsAlert] = useState(false);

  const fetchCollaborators = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany) {
      return;
    }

    if (!session?.user) {
      setCollaborators([]);
      setLoadingCollaborators(false);
      return;
    }

    if (!primaryCompanyId) {
      setCollaborators([]);
      setLoadingCollaborators(false);
      return;
    }

    setLoadingCollaborators(true);
    const { data, error } = await supabase
      .from('collaborators')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone_number,
        hire_date,
        role_type_id,
        commission_percentage,
        status,
        avatar_url,
        role_types(description)
      `)
      .eq('company_id', primaryCompanyId)
      .eq('is_arena_system_placeholder', false)
      .order('first_name', { ascending: true });

    if (error) {
      showOperationError('Erro ao carregar colaboradores.', error);
      setCollaborators([]);
    } else if (data) {
      const formattedData: Collaborator[] = data.map(col => ({
        ...col,
        role_description: (col.role_types as { description: string })?.description || 'N/A',
      }));
      setCollaborators(formattedData);
    }
    setLoadingCollaborators(false);
  }, [session, primaryCompanyId, sessionLoading, loadingPrimaryCompany]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  // Verificar se deve mostrar alerta de permissões na primeira visita
  useEffect(() => {
    if (!sessionLoading && !loadingPrimaryCompany && session?.user && primaryCompanyId) {
      const userId = session.user.id;
      const shouldShowAlert = !hasSeenAlert(ALERT_KEYS.COLLABORATORS_MENU, userId, primaryCompanyId);
      
      if (shouldShowAlert) {
        // Mostrar alerta após um pequeno delay para garantir que a página carregou
        const timer = setTimeout(() => {
          setShowPermissionsAlert(true);
        }, 500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [sessionLoading, loadingPrimaryCompany, session, primaryCompanyId]);

  const handleDeleteClick = (collaboratorId: string) => {
    setCollaboratorToDelete(collaboratorId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (collaboratorToDelete && session?.user && primaryCompanyId) {
      setLoadingCollaborators(true);
      const { error } = await supabase
        .from('collaborators')
        .delete()
        .eq('id', collaboratorToDelete)
        .eq('company_id', primaryCompanyId);

      if (error) {
        showOperationError('Erro ao excluir colaborador.', error);
      } else {
        showSuccess('Colaborador excluído com sucesso!');
        fetchCollaborators(); // Refresh the list
      }
      setLoadingCollaborators(false);
      setIsDeleteDialogOpen(false);
      setCollaboratorToDelete(null);
    }
  };

  if (sessionLoading || loadingPrimaryCompany || loadingCollaborators) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando colaboradores...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para ver os colaboradores.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para gerenciar colaboradores.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/register-company')}
        >
          <i className="fas fa-building mr-2"></i>
          Cadastrar Empresa
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Colaboradores</h1>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Button
            onClick={() => navigate('/menu-permissions')}
            className="!rounded-button bg-blue-600 hover:bg-blue-700 text-white"
            title="Gerenciar permissões de menu por função"
          >
            <Shield className="h-4 w-4 mr-2" />
            Permissões de Menu
          </Button>
          {createButton(() => navigate('/colaboradores/new'), 'fas fa-user-plus', 'Adicionar Colaborador')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {collaborators.length === 0 ? (
          <p className="text-gray-600">Nenhum colaborador encontrado para sua empresa. Adicione um novo colaborador para começar!</p>
        ) : (
          collaborators.map((colaborador) => (
            <Card key={colaborador.id} className="border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="text-center">
                  <Avatar className="w-20 h-20 mx-auto mb-4">
                    <AvatarImage src={colaborador.avatar_url || `https://readdy.ai/api/search-image?query=professional%20${colaborador.role_description?.toLowerCase() || 'person'}%20portrait%20with%20modern%20styling%20tools%20in%20clean%20environment%20with%20professional%20lighting%20and%20neutral%20background&width=80&height=80&seq=${colaborador.id}&orientation=squarish`} />
                    <AvatarFallback className="bg-gray-200 text-gray-700 text-xl">
                      {colaborador.first_name.split(' ').map(n => n[0]).join('')}{colaborador.last_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="font-bold text-gray-900 text-lg">{colaborador.first_name} {colaborador.last_name}</h3>
                  <p className="text-gray-600 mb-3">{colaborador.role_description}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">E-mail:</span>
                      <span className="font-semibold text-gray-900 break-all">{colaborador.email}</span> {/* Added break-all */}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Telefone:</span>
                      <span className="font-semibold text-gray-900">{colaborador.phone_number ? `(${colaborador.phone_number.substring(0,2)}) ${colaborador.phone_number.substring(2,7)}-${colaborador.phone_number.substring(7)}` : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <span className="font-semibold text-gray-900">{colaborador.status}</span>
                    </div>
                  </div>
                  <TooltipProvider>
                    <div className="flex justify-center gap-2 mt-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/colaboradores/edit/${colaborador.id}`);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Editar dados do colaborador</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/colaboradores/${colaborador.id}/servicos`);
                            }}
                          >
                            <Briefcase className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Relacionar serviços do profissional</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/colaboradores/${colaborador.id}/schedule`);
                            }}
                          >
                            <Clock className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Configurar horários de atendimento</p>
                        </TooltipContent>
                      </Tooltip>

                      <Button
                        variant="destructive"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(colaborador.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TooltipProvider>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este colaborador? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={loadingCollaborators}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={loadingCollaborators}>
              {loadingCollaborators ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Alert Modal */}
      <PermissionsAlertModal
        open={showPermissionsAlert}
        onClose={() => {
          setShowPermissionsAlert(false);
        }}
        onGoToPermissions={() => {
          setShowPermissionsAlert(false);
          navigate('/menu-permissions');
        }}
        onDontShowAgain={(dontShow) => {
          if (dontShow && session?.user && primaryCompanyId) {
            markAlertAsSeen(ALERT_KEYS.COLLABORATORS_MENU, session.user.id, primaryCompanyId, true);
          }
        }}
        title="Configure as Permissões de Menu"
        message="É importante configurar as permissões de menu para definir quais funções (roles) têm acesso a quais menus na sua empresa. Clique no botão 'Permissões de Menu' acima para começar."
      />
    </div>
  );
};

export default ColaboradoresPage;