import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, DollarSign, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import PlanFormModal from '@/components/PlanFormModal';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  features: string[] | null;
  duration_months: number;
  status: 'active' | 'inactive' | 'deprecated';
}

const PlanManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!session?.user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Fetch all plans (RLS ensures only Global Admin can see all statuses)
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      console.error('Error fetching plans:', error);
    } else if (data) {
      setPlans(data as Plan[]);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleAddPlan = () => {
    setEditingPlan(null);
    setIsFormModalOpen(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setIsFormModalOpen(true);
  };

  const handleDeleteClick = (planId: string) => {
    setPlanToDelete(planId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;

    setLoading(true);
    try {
      // 1. Verificar se o plano está sendo usado por alguma assinatura
      const { data: subscriptions, error: checkError } = await supabase
        .from('company_subscriptions')
        .select('id, company_id, status')
        .eq('plan_id', planToDelete)
        .limit(1);

      if (checkError) {
        throw checkError;
      }

      // 2. Se houver assinaturas usando este plano, bloquear a exclusão
      if (subscriptions && subscriptions.length > 0) {
        const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
        if (activeSubscriptions.length > 0) {
          showError(
            `Não é possível excluir este plano! Ele está sendo usado por ${activeSubscriptions.length} assinatura(s) ativa(s). ` +
            `Desative o plano ou migre as empresas para outro plano antes de excluir.`
          );
          setLoading(false);
          setIsDeleteDialogOpen(false);
          setPlanToDelete(null);
          return;
        } else {
          // Há assinaturas históricas, mas nenhuma ativa - ainda assim não permitir exclusão
          showError(
            `Não é possível excluir este plano! Ele possui histórico de assinaturas. ` +
            `Para manter a integridade dos dados, apenas desative o plano alterando seu status para "Inativo" ou "Descontinuado".`
          );
          setLoading(false);
          setIsDeleteDialogOpen(false);
          setPlanToDelete(null);
          return;
        }
      }

      // 3. Se não houver assinaturas, permitir a exclusão
      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', planToDelete);

      if (error) {
        throw error;
      }

      showSuccess('Plano excluído com sucesso!');
      fetchPlans();
    } catch (error: any) {
      console.error('Error deleting plan:', error);
      
      // Tratar erro específico de foreign key constraint
      if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
        showError(
          'Não é possível excluir este plano! Ele está sendo referenciado por assinaturas existentes. ' +
          'Desative o plano alterando seu status para "Inativo" ou "Descontinuado" em vez de excluí-lo.'
        );
      } else {
        showError('Erro ao excluir plano: ' + (error.message || 'Erro desconhecido'));
      }
    } finally {
      setLoading(false);
      setIsDeleteDialogOpen(false);
      setPlanToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Ativo</span>;
      case 'inactive': return <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Inativo</span>;
      case 'deprecated': return <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Descontinuado</span>;
      default: return null;
    }
  };

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
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Planos de Assinatura</h1>
      </div>

      <div className="max-w-4xl space-y-6">
        <Card className="border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-gray-900">Planos do Sistema</CardTitle>
            <Button
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddPlan}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo Plano
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-gray-700">Carregando planos...</p>
            ) : plans.length === 0 ? (
              <p className="text-gray-600">Nenhum plano de assinatura cadastrado ainda.</p>
            ) : (
              <div className="grid gap-4">
                {plans.map((plan) => (
                  <div key={plan.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-4">
                      <DollarSign className="h-6 w-6 text-primary" />
                      <div>
                        <h3 className="font-bold text-gray-900">{plan.name}</h3>
                        <p className="text-sm text-gray-600">R$ {plan.price.toFixed(2).replace('.', ',')} / {plan.duration_months} {plan.duration_months > 1 ? 'meses' : 'mês'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(plan.status)}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => navigate(`/admin-dashboard/plans/${plan.id}/features`)}
                        title="Gerenciar funcionalidades do plano"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => handleEditPlan(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="!rounded-button whitespace-nowrap"
                        onClick={() => handleDeleteClick(plan.id)}
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

      {/* Form Modal for Add/Edit Plan */}
      <PlanFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        editingPlan={editingPlan}
        onPlanSaved={fetchPlans}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.
              <br /><br />
              <strong>Importante:</strong> Planos que estão sendo usados por assinaturas (ativas ou históricas) não podem ser excluídos. 
              Se o plano estiver em uso, você receberá uma mensagem de erro e deverá desativá-lo em vez de excluí-lo.
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

export default PlanManagementPage;