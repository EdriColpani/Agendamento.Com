import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Edit, Trash2, ArrowLeft, Settings, Users, Package, User } from 'lucide-react';
import { PlusCircle as PlusCircleIcon } from 'lucide-react'; // Importar PlusCircle para o botão de criar
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Feature {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  company_flag_name: string | null;
}

interface PlanFeature {
  plan_id: string;
  feature_id: string;
  feature_limit: number | null;
  features: Feature; // Relação para obter detalhes da funcionalidade
}

interface PlanLimit {
  id: string;
  plan_id: string;
  limit_type: string;
  limit_value: number;
}

const PlanFeaturesManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { planId } = useParams<{ planId: string }>();
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([]);
  const [availableFeatures, setAvailableFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [planName, setPlanName] = useState('');
  const [creatingNewFeature, setCreatingNewFeature] = useState(false); // Novo estado

  // Estado para o modal de adicionar/editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlanFeature, setEditingPlanFeature] = useState<PlanFeature | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('');
  const [featureLimit, setFeatureLimit] = useState<number | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<PlanFeature | null>(null);
  const [featureName, setFeatureName] = useState(''); // Novo estado para o nome da funcionalidade
  const [featureDescription, setFeatureDescription] = useState<string | null>(null); // Novo estado para a descrição
  const [companyFlagName, setCompanyFlagName] = useState<string>(''); // Estado para o flag da empresa

  // Estados para gerenciamento de limites
  const [planLimits, setPlanLimits] = useState<PlanLimit[]>([]);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [editingLimit, setEditingLimit] = useState<PlanLimit | null>(null);
  const [limitType, setLimitType] = useState<string>('collaborators');
  const [limitValue, setLimitValue] = useState<string>('');
  const [isConfirmDeleteLimitOpen, setIsConfirmDeleteLimitOpen] = useState(false);
  const [limitToDelete, setLimitToDelete] = useState<PlanLimit | null>(null);

  const fetchPlanDetails = useCallback(async () => {
    if (!planId) return;
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('name')
        .eq('id', planId)
        .single();
      if (error) throw error;
      setPlanName(data.name);
    } catch (error: any) {
      console.error('Erro ao carregar detalhes do plano:', error);
      showError('Erro ao carregar detalhes do plano.');
      navigate('/admin-dashboard/plans'); // Volta se não encontrar o plano
    }
  }, [planId, navigate]);

  const fetchPlanFeatures = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plan_features')
        .select(`
          plan_id,
          feature_id,
          feature_limit,
          features (
            id,
            name,
            slug,
            description,
            is_active,
            company_flag_name
          )
        `)
        .eq('plan_id', planId);

      if (error) throw error;
      console.log('fetchPlanFeatures: Raw data from Supabase:', data); // DEBUG LOG
      // O Supabase retorna features como objeto, não array
      setPlanFeatures(data as unknown as PlanFeature[]);
    } catch (error: any) {
      console.error('Erro ao carregar funcionalidades do plano:', error);
      showError('Erro ao carregar funcionalidades do plano.');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  const fetchAvailableFeatures = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('features')
        .select('*')
        .eq('is_active', true); // Apenas funcionalidades ativas
      if (error) throw error;
      setAvailableFeatures(data as Feature[]);
    } catch (error: any) {
      console.error('Erro ao carregar funcionalidades disponíveis:', error);
      showError('Erro ao carregar funcionalidades disponíveis.');
    }
  }, []);

  // Função para buscar limites do plano
  const fetchPlanLimits = useCallback(async () => {
    if (!planId) return;
    try {
      const { data, error } = await supabase
        .from('plan_limits')
        .select('*')
        .eq('plan_id', planId)
        .order('limit_type', { ascending: true });

      if (error) throw error;
      setPlanLimits(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar limites do plano:', error);
      showError('Erro ao carregar limites do plano.');
    }
  }, [planId]);

  useEffect(() => {
    if (planId) {
      fetchPlanDetails();
      fetchPlanFeatures();
      fetchAvailableFeatures();
      fetchPlanLimits(); // Buscar limites também
    }
  }, [planId, fetchPlanDetails, fetchPlanFeatures, fetchAvailableFeatures, fetchPlanLimits]);

  const handleAddFeatureClick = () => {
    setEditingPlanFeature(null);
    setSelectedFeatureId(''); // Não será mais usado diretamente para a entrada
    setFeatureName('');
    setFeatureDescription('');
    setFeatureLimit(null);
    setCompanyFlagName('none');
    setIsModalOpen(true);
  };

  const handleEditFeatureClick = (planFeature: PlanFeature) => {
    console.log('handleEditFeatureClick: planFeature recebido:', planFeature);
    setEditingPlanFeature(planFeature);
    setSelectedFeatureId(planFeature.feature_id); // Manter o ID para o update
    setFeatureName(planFeature.features.name); // Preencher o nome da funcionalidade
    setFeatureDescription(planFeature.features.description || ''); // Preencher a descrição (garantir string vazia se for null)
    setFeatureLimit(planFeature.feature_limit);
    setCompanyFlagName(planFeature.features.company_flag_name || 'none');
    setIsModalOpen(true);
  };

  const handleSavePlanFeature = async () => {
    if (!planId || !featureName.trim()) {
      showError('O nome da funcionalidade é obrigatório.');
      return;
    }

    setLoading(true);
    let featureIdToAssociate: string | null = null;

    try {
      // 1. Tentar encontrar uma funcionalidade existente pelo nome
      const { data: existingFeature, error: fetchFeatureError } = await supabase
        .from('features')
        .select('id, description, company_flag_name')
        .eq('name', featureName.trim())
        .single();

      if (fetchFeatureError && fetchFeatureError.code !== 'PGRST116') { // PGRST116 = No rows found
        throw fetchFeatureError;
      }

      if (existingFeature) {
        featureIdToAssociate = existingFeature.id;
        // Se estiver editando uma funcionalidade e o nome mudou, ou a descrição mudou
        if (editingPlanFeature && editingPlanFeature.feature_id === existingFeature.id) {
          // Atualiza descrição e flag se mudaram
          const updates: { description?: string; company_flag_name?: string | null } = {};
          if (existingFeature.description !== featureDescription) {
            updates.description = featureDescription;
          }
          const flagValue = (companyFlagName === 'none' || !companyFlagName.trim()) ? null : companyFlagName.trim();
          if (existingFeature.company_flag_name !== flagValue) {
            updates.company_flag_name = flagValue;
          }
          if (Object.keys(updates).length > 0) {
            const { error: updateFeatureError } = await supabase
              .from('features')
              .update(updates)
              .eq('id', existingFeature.id);
            if (updateFeatureError) throw updateFeatureError;
          }
        } else if (!editingPlanFeature) {
          // Se estiver adicionando e a funcionalidade já existe, atualiza o flag se necessário
          const flagValue = (companyFlagName === 'none' || !companyFlagName.trim()) ? null : companyFlagName.trim();
          if (existingFeature.company_flag_name !== flagValue) {
            const { error: updateFeatureError } = await supabase
              .from('features')
              .update({ company_flag_name: flagValue })
              .eq('id', existingFeature.id);
            if (updateFeatureError) throw updateFeatureError;
          }
        }
      } else {
        // 2. Se a funcionalidade não existe, criar uma nova
        const flagValue = (companyFlagName === 'none' || !companyFlagName.trim()) ? null : companyFlagName.trim();
        const { data: newFeature, error: createFeatureError } = await supabase
          .from('features')
          .insert({
            name: featureName.trim(),
            slug: featureName.trim().toLowerCase().replace(/\s/g, '-'),
            description: featureDescription,
            company_flag_name: flagValue,
            is_active: true,
          })
          .select('id')
          .single();

        if (createFeatureError) throw createFeatureError;
        featureIdToAssociate = newFeature.id;
        showSuccess(`Funcionalidade "${featureName}" criada com sucesso!`);
      }

      if (!featureIdToAssociate) {
        throw new Error('Não foi possível determinar a funcionalidade para associar.');
      }

      console.log(`handleSavePlanFeature: planId: ${planId}, featureIdToAssociate: ${featureIdToAssociate}, featureLimit: ${featureLimit}`);

      // 3. Associar (ou atualizar) a funcionalidade ao plano
      if (editingPlanFeature) {
        console.log('handleSavePlanFeature (EDITING): editingPlanFeature.feature_id:', editingPlanFeature.feature_id, 'featureIdToAssociate:', featureIdToAssociate);
        // Se o ID da funcionalidade mudou durante a edição
        if (editingPlanFeature.feature_id !== featureIdToAssociate) {
          // Primeiro, remova a antiga associação
          const { error: deleteOldError } = await supabase
            .from('plan_features')
            .delete()
            .eq('plan_id', planId)
            .eq('feature_id', editingPlanFeature.feature_id);
          if (deleteOldError) throw deleteOldError;

          // Em seguida, adicione a nova associação
          const { error: insertNewError } = await supabase
            .from('plan_features')
            .insert({
              plan_id: planId,
              feature_id: featureIdToAssociate,
              feature_limit: featureLimit,
            });
          if (insertNewError) throw insertNewError;
        } else {
          // Atualizar limite para funcionalidade existente
          const { error } = await supabase
            .from('plan_features')
            .update({ feature_limit: featureLimit })
            .eq('plan_id', planId)
            .eq('feature_id', featureIdToAssociate);
          if (error) throw error;
        }
        showSuccess('Funcionalidade do plano atualizada com sucesso!');
      } else {
        // Adicionar nova associação
        const { error } = await supabase
          .from('plan_features')
          .insert({
            plan_id: planId,
            feature_id: featureIdToAssociate,
            feature_limit: featureLimit,
          });

        if (error) throw error;
        showSuccess('Funcionalidade adicionada ao plano com sucesso!');
      }

      setIsModalOpen(false);
      fetchPlanFeatures(); // Recarrega a lista
      fetchAvailableFeatures(); // Recarrega as funcionalidades disponíveis (caso uma nova tenha sido criada)
    } catch (error: any) {
      console.error('Erro ao salvar funcionalidade do plano:', error);
      showError('Erro ao salvar funcionalidade do plano: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = (planFeature: PlanFeature) => {
    setFeatureToDelete(planFeature);
    setIsConfirmDeleteOpen(true);
  };

  const handleDeletePlanFeature = async () => {
    if (!featureToDelete || !planId) return;
    console.log(`handleDeletePlanFeature: planId: ${planId}, featureToDelete.feature_id: ${featureToDelete.feature_id}`);

    setLoading(true);
    try {
      const { error } = await supabase
        .from('plan_features')
        .delete()
        .eq('plan_id', planId)
        .eq('feature_id', featureToDelete.feature_id);

      if (error) throw error;
      showSuccess('Funcionalidade removida do plano com sucesso!');
      setIsConfirmDeleteOpen(false);
      setFeatureToDelete(null);
      fetchPlanFeatures(); // Recarrega a lista
    } catch (error: any) {
      console.error('Erro ao remover funcionalidade do plano:', error);
      showError('Erro ao remover funcionalidade do plano: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funções para gerenciar limites
  const handleAddLimitClick = () => {
    setEditingLimit(null);
    setLimitType('collaborators');
    setLimitValue('');
    setIsLimitModalOpen(true);
  };

  const handleEditLimitClick = (limit: PlanLimit) => {
    setEditingLimit(limit);
    setLimitType(limit.limit_type);
    setLimitValue(limit.limit_value.toString());
    setIsLimitModalOpen(true);
  };

  const handleSaveLimit = async () => {
    if (!planId || !limitType.trim()) {
      showError('O tipo de limite é obrigatório.');
      return;
    }

    const limitValueNum = limitValue.trim() === '' ? 0 : parseInt(limitValue, 10);
    if (isNaN(limitValueNum) || limitValueNum < 0) {
      showError('O valor do limite deve ser um número positivo ou 0 para ilimitado.');
      return;
    }

    setLoading(true);
    try {
      if (editingLimit) {
        // Atualizar limite existente
        const { error } = await supabase
          .from('plan_limits')
          .update({
            limit_type: limitType,
            limit_value: limitValueNum,
          })
          .eq('id', editingLimit.id);

        if (error) throw error;
        showSuccess('Limite atualizado com sucesso!');
      } else {
        // Criar novo limite
        const { error } = await supabase
          .from('plan_limits')
          .insert({
            plan_id: planId,
            limit_type: limitType,
            limit_value: limitValueNum,
          });

        if (error) throw error;
        showSuccess('Limite adicionado com sucesso!');
      }

      setIsLimitModalOpen(false);
      
      // Recarregar a lista com tratamento de erro silencioso
      try {
        await fetchPlanLimits();
      } catch (fetchError: any) {
        // Se houver erro ao recarregar, não bloquear o sucesso do salvamento
        console.warn('Aviso: Erro ao recarregar lista de limites (mas o limite foi salvo):', fetchError);
        // Forçar recarregamento manual após um pequeno delay
        setTimeout(() => {
          fetchPlanLimits().catch(err => console.warn('Erro ao recarregar após delay:', err));
        }, 1000);
      }
    } catch (error: any) {
      console.error('Erro ao salvar limite:', error);
      
      // Verificar se é erro CORS ou de rede
      const isCorsError = error?.message?.includes('CORS') || 
                         error?.message?.includes('Failed to fetch') ||
                         error?.code === 'PGRST301';
      
      if (isCorsError) {
        showError('Erro de conexão. O limite pode ter sido salvo. Verifique a lista ou recarregue a página.');
      } else {
        showError('Erro ao salvar limite: ' + (error.message || 'Erro desconhecido'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLimitConfirm = (limit: PlanLimit) => {
    setLimitToDelete(limit);
    setIsConfirmDeleteLimitOpen(true);
  };

  const handleDeleteLimit = async () => {
    if (!limitToDelete) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('plan_limits')
        .delete()
        .eq('id', limitToDelete.id);

      if (error) throw error;
      showSuccess('Limite removido com sucesso!');
      setIsConfirmDeleteLimitOpen(false);
      setLimitToDelete(null);
      fetchPlanLimits(); // Recarrega a lista
    } catch (error: any) {
      console.error('Erro ao remover limite:', error);
      showError('Erro ao remover limite: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getLimitTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; icon: React.ReactNode }> = {
      collaborators: { label: 'Colaboradores', icon: <Users className="h-4 w-4" /> },
      services: { label: 'Serviços', icon: <Package className="h-4 w-4" /> },
      clients: { label: 'Clientes', icon: <User className="h-4 w-4" /> },
    };
    return labels[type] || { label: type, icon: <Settings className="h-4 w-4" /> };
  };

  if (loading && planName === '') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Settings className="h-8 w-8 animate-spin text-gray-700" />
        <p className="text-gray-700 ml-2">Carregando funcionalidades do plano...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin-dashboard/plans')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <h1 className="text-3xl font-bold">Gerenciar Funcionalidades do Plano: {planName}</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">Funcionalidades Atribuídas</CardTitle>
          <Button onClick={handleAddFeatureClick} size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" /> Adicionar Funcionalidade
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Settings className="h-6 w-6 animate-spin text-gray-600" />
              <p className="text-gray-600 ml-2">Carregando funcionalidades...</p>
            </div>
          ) : planFeatures.length === 0 ? (
            <p className="text-gray-500">Nenhuma funcionalidade atribuída a este plano.</p>
          ) : (
            <div className="space-y-4">
              {planFeatures.map((pf) => (
                <div key={pf.feature_id} className="flex items-center justify-between p-3 border rounded-md">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{pf.features.name}</p>
                      {pf.features.company_flag_name && (
                        <Badge variant="secondary" className="text-xs">
                          Controla: {pf.features.company_flag_name}
                        </Badge>
                      )}
                    </div>
                    {pf.feature_limit !== null && (
                      <p className="text-sm text-gray-500">Limite: {pf.feature_limit}</p>
                    )}
                    {pf.features.description && (
                      <p className="text-xs text-gray-400 mt-1">{pf.features.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleEditFeatureClick(pf)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDeleteConfirm(pf)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção de Limites do Plano */}
      <Card className="border-gray-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div>
            <CardTitle className="text-xl font-bold text-gray-900">Limites do Plano</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Configure limites para controlar o uso dos recursos</p>
          </div>
          <Button 
            onClick={handleAddLimitClick} 
            size="sm" 
            className="h-9 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <PlusCircle className="h-4 w-4" /> Adicionar Limite
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {planLimits.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 font-medium mb-1">Nenhum limite configurado</p>
              <p className="text-sm text-gray-400">Os recursos deste plano estarão ilimitados até você configurar limites.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {planLimits.map((limit) => {
                const limitInfo = getLimitTypeLabel(limit.limit_type);
                const isUnlimited = limit.limit_value === 0;
                return (
                  <div 
                    key={limit.id} 
                    className="group relative p-4 border-2 border-gray-200 rounded-lg bg-white hover:border-primary hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary group-hover:bg-amber-200 transition-colors">
                          {limitInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 mb-1">{limitInfo.label}</h3>
                          <div className="flex items-center gap-2">
                            {isUnlimited ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                Ilimitado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {limit.limit_value} {limit.limit_value === 1 ? limitInfo.label.slice(0, -1) : limitInfo.label.toLowerCase()}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={() => handleEditLimitClick(limit)}
                          className="h-8 w-8 border-gray-300 hover:border-primary hover:bg-primary/10"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={() => handleDeleteLimitConfirm(limit)}
                          className="h-8 w-8 border-gray-300 hover:border-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {planLimits.length > 0 && (
            <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800 flex items-start gap-2">
                <span className="font-semibold">💡 Dica:</span>
                <span>Configure limites para controlar o uso do plano. Deixe o valor em 0 para permitir quantidade ilimitada.</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal para Adicionar/Editar Funcionalidade */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlanFeature ? 'Editar Funcionalidade do Plano' : 'Adicionar Funcionalidade ao Plano'}</DialogTitle>
            <DialogDescription>
              {editingPlanFeature ? `Edite a funcionalidade ${editingPlanFeature.features.name} para o plano ${planName}.` : `Adicione uma nova funcionalidade ao plano ${planName}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="feature-name" className="text-right">Nome da Funcionalidade</Label>
              <Input
                id="feature-name"
                type="text"
                value={featureName}
                onChange={(e) => setFeatureName(e.target.value)}
                className="col-span-3"
                placeholder="Ex: Envio de Mensagens WhatsApp"
                disabled={creatingNewFeature || (!!editingPlanFeature && editingPlanFeature.features.name === featureName)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="feature-description" className="text-right">Descrição (Opcional)</Label>
              <Textarea
                id="feature-description"
                value={featureDescription || ''}
                onChange={(e) => setFeatureDescription(e.target.value)}
                className="col-span-3"
                placeholder="Uma breve descrição sobre a funcionalidade."
                disabled={creatingNewFeature}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="company-flag" className="text-right">Controla Flag da Empresa</Label>
              <Select
                value={companyFlagName || 'none'}
                onValueChange={(value) => setCompanyFlagName(value === 'none' ? '' : value)}
                disabled={creatingNewFeature}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione o flag (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (apenas descritiva)</SelectItem>
                  <SelectItem value="whatsapp_messaging_enabled">whatsapp_messaging_enabled</SelectItem>
                  {/* Adicione mais flags conforme necessário */}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="limit" className="text-right">Limite (opcional)</Label>
              <Input
                id="limit"
                type="number"
                value={featureLimit === null ? '' : featureLimit}
                onChange={(e) => setFeatureLimit(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                className="col-span-3"
                placeholder="Ex: 100 (deixe em branco para ilimitado)"
                disabled={creatingNewFeature}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePlanFeature}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover a funcionalidade '{featureToDelete?.features.name}' do plano '{planName}'?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeletePlanFeature}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Adicionar/Editar Limite */}
      <Dialog open={isLimitModalOpen} onOpenChange={setIsLimitModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {editingLimit ? 'Editar Limite' : 'Adicionar Limite'}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {editingLimit ? `Configure o limite para o plano "${planName}".` : `Defina um novo limite para o plano "${planName}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="limit-type" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Settings className="h-4 w-4 text-gray-500" />
                Tipo de Limite
              </Label>
              <Select value={limitType} onValueChange={setLimitType}>
                <SelectTrigger className="h-11 border-gray-300 focus:border-primary focus:ring-primary">
                  <SelectValue placeholder="Selecione o tipo de limite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collaborators">
                    <div className="flex items-center gap-3 py-1">
                      <Users className="h-5 w-5 text-gray-600" />
                      <div>
                        <div className="font-medium">Colaboradores</div>
                        <div className="text-xs text-gray-500">Limite de pessoas na equipe</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="services">
                    <div className="flex items-center gap-3 py-1">
                      <Package className="h-5 w-5 text-gray-600" />
                      <div>
                        <div className="font-medium">Serviços</div>
                        <div className="text-xs text-gray-500">Limite de serviços cadastrados</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="clients">
                    <div className="flex items-center gap-3 py-1">
                      <User className="h-5 w-5 text-gray-600" />
                      <div>
                        <div className="font-medium">Clientes</div>
                        <div className="text-xs text-gray-500">Limite de clientes cadastrados</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit-value" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span className="text-lg">🔢</span>
                Valor do Limite
              </Label>
              <Input
                id="limit-value"
                type="number"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                className="h-11 text-lg border-gray-300 focus:border-primary focus:ring-primary"
                placeholder="Ex: 5"
                min="0"
              />
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800 flex items-start gap-2">
                  <span className="font-bold mt-0.5">💡</span>
                  <span>
                    <strong>Ilimitado:</strong> Digite <strong>0</strong> ou deixe em branco<br />
                    <strong>Com limite:</strong> Digite um número positivo (ex: 5, 10, 50)
                  </span>
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button 
              variant="outline" 
              onClick={() => setIsLimitModalOpen(false)}
              className="border-gray-300 hover:bg-gray-50"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveLimit} 
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {loading ? (
                <>
                  <Settings className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Limite'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão de Limite */}
      <Dialog open={isConfirmDeleteLimitOpen} onOpenChange={setIsConfirmDeleteLimitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão de Limite</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover o limite de '{getLimitTypeLabel(limitToDelete?.limit_type || '').label}' do plano '{planName}'?
              Isso permitirá quantidade ilimitada para este recurso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDeleteLimitOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLimit} disabled={loading}>
              {loading ? 'Removendo...' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlanFeaturesManagementPage;
