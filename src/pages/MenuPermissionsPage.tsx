import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { showError, showOperationError, showSuccess } from '@/utils/toast';
import { Loader2, ArrowLeft, Shield, Save } from 'lucide-react';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useSession } from '@/components/SessionContextProvider';

interface Menu {
  id: string;
  menu_key: string;
  label: string;
  icon: string;
  path: string;
  display_order: number;
}

interface RoleType {
  id: number;
  description: string;
  apresentar: boolean;
}

interface MenuPermission {
  id?: string;
  company_id: string;
  menu_id: string;
  role_type_id: number;
  has_access: boolean;
}

const MenuPermissionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<number, boolean>>>({});
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  useEffect(() => {
    if (primaryCompanyId) {
      fetchData();
    }
  }, [primaryCompanyId]);

  const fetchData = useCallback(async () => {
    if (!primaryCompanyId) return;

    setLoading(true);
    try {
      // 1. Buscar plano ativo da empresa
      const { data: subscriptionData, error: subError } = await supabase
        .from('company_subscriptions')
        .select('plan_id')
        .eq('company_id', primaryCompanyId)
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError && subError.code !== 'PGRST116') {
        throw subError;
      }

      const planId = subscriptionData?.plan_id || null;
      setActivePlanId(planId);

      if (!planId) {
        showError('Sua empresa não possui um plano ativo. Ative um plano para gerenciar permissões de menu.');
        setMenus([]);
        setLoading(false);
        return;
      }

      // 2. Buscar menus vinculados ao plano
      const { data: menuPlansData, error: menuPlansError } = await supabase
        .from('menu_plans')
        .select('menu_id, menus(id, menu_key, label, icon, path, display_order)')
        .eq('plan_id', planId);

      if (menuPlansError) throw menuPlansError;

      const availableMenus = (menuPlansData || [])
        .map((mp: any) => mp.menus)
        .filter(Boolean)
        .sort((a: Menu, b: Menu) => a.display_order - b.display_order);

      setMenus(availableMenus);

      // 3. Buscar roles disponíveis (apenas com apresentar = true)
      const { data: rolesData, error: rolesError } = await supabase
        .from('role_types')
        .select('id, description, apresentar')
        .eq('apresentar', true)
        .order('description', { ascending: true });

      if (rolesError) throw rolesError;
      setRoleTypes(rolesData || []);

      // 4. Buscar permissões existentes
      if (availableMenus.length > 0) {
        const menuIds = availableMenus.map((m: Menu) => m.id);
        const { data: permissionsData, error: permissionsError } = await supabase
          .from('menu_role_permissions')
          .select('*')
          .eq('company_id', primaryCompanyId)
          .in('menu_id', menuIds);

        if (permissionsError) throw permissionsError;

        // Organizar permissões em um mapa: menu_id -> role_type_id -> has_access
        const permissionsMap: Record<string, Record<number, boolean>> = {};
        (permissionsData || []).forEach((perm: MenuPermission) => {
          if (!permissionsMap[perm.menu_id]) {
            permissionsMap[perm.menu_id] = {};
          }
          permissionsMap[perm.menu_id][perm.role_type_id] = perm.has_access;
        });

        setPermissions(permissionsMap);
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      showOperationError('Erro ao carregar dados de permissões.', error);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId]);

  const handlePermissionChange = (menuId: string, roleTypeId: number, hasAccess: boolean) => {
    setPermissions(prev => {
      const newPerms = { ...prev };
      if (!newPerms[menuId]) {
        newPerms[menuId] = {};
      }
      newPerms[menuId][roleTypeId] = hasAccess;
      return newPerms;
    });
  };

  const handleSave = async () => {
    if (!primaryCompanyId || !activePlanId) {
      showError('Erro: Empresa ou plano não encontrado.');
      return;
    }

    setSaving(true);
    try {
      // Para cada menu e role, criar ou atualizar permissão
      const permissionsToUpsert: MenuPermission[] = [];

      menus.forEach(menu => {
        roleTypes.forEach(role => {
          const hasAccess = permissions[menu.id]?.[role.id] ?? true; // Default: true
          permissionsToUpsert.push({
            company_id: primaryCompanyId,
            menu_id: menu.id,
            role_type_id: role.id,
            has_access: hasAccess,
          });
        });
      });

      // Deletar todas as permissões existentes para os menus do plano
      const menuIds = menus.map(m => m.id);
      if (menuIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('menu_role_permissions')
          .delete()
          .eq('company_id', primaryCompanyId)
          .in('menu_id', menuIds);

        if (deleteError) throw deleteError;
      }

      // Inserir novas permissões
      if (permissionsToUpsert.length > 0) {
        const { error: insertError } = await supabase
          .from('menu_role_permissions')
          .insert(permissionsToUpsert);

        if (insertError) throw insertError;
      }

      showSuccess('Permissões salvas com sucesso!');
      fetchData(); // Recarregar para garantir sincronização
    } catch (error: any) {
      console.error('Erro ao salvar permissões:', error);
      showOperationError('Erro ao salvar permissões.', error);
    } finally {
      setSaving(false);
    }
  };

  if (loadingPrimaryCompany || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600 dark:text-gray-400" />
          <p className="text-gray-700 dark:text-gray-300">Carregando permissões...</p>
        </div>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-red-500 mb-4">Você precisa ter uma empresa primária cadastrada.</p>
          <Button onClick={() => navigate('/register-company')} className="!rounded-button">
            Cadastrar Empresa
          </Button>
        </div>
      </div>
    );
  }

  if (!activePlanId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Sua empresa não possui um plano ativo. Ative um plano para gerenciar permissões de menu.
          </p>
          <Button onClick={() => navigate('/planos')} className="!rounded-button">
            Ver Planos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/colaboradores')}
              className="!rounded-button"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield className="h-8 w-8 text-blue-600" />
                Permissões de Menu
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Defina quais funções (roles) têm acesso a quais menus na sua empresa
              </p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || menus.length === 0}
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
                Salvar Permissões
              </>
            )}
          </Button>
        </div>

        {/* Info Card */}
        <Card className="border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Como funciona:</strong> Marque os checkboxes para permitir que uma função acesse um menu.
              Desmarque para negar acesso. As alterações só serão salvas quando você clicar em "Salvar Permissões".
            </p>
          </CardContent>
        </Card>

        {/* Permissions Matrix */}
        {menus.length === 0 ? (
          <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-800">
            <CardContent className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Nenhum menu disponível para o plano ativo da sua empresa.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200 dark:border-gray-700 dark:bg-gray-800">
            <CardHeader>
              <CardTitle>Matriz de Permissões</CardTitle>
              <CardDescription>
                {menus.length} menu(s) disponível(is) no seu plano • {roleTypes.length} função(ões) configurada(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left p-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-gray-100 dark:bg-gray-800 z-10">
                        Menu
                      </th>
                      {roleTypes.map(role => (
                        <th key={role.id} className="text-center p-3 font-semibold text-gray-900 dark:text-white min-w-[120px]">
                          {role.description}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {menus.map((menu, index) => (
                      <tr 
                        key={menu.id} 
                        className={`border-b border-gray-200 dark:border-gray-700 ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}
                      >
                        <td className="p-3 sticky left-0 bg-inherit z-10">
                          <div className="flex items-center gap-2">
                            <i className={`${menu.icon} text-gray-600 dark:text-gray-400`}></i>
                            <span className="font-medium text-gray-900 dark:text-white">{menu.label}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{menu.path}</p>
                        </td>
                        {roleTypes.map(role => {
                          const hasAccess = permissions[menu.id]?.[role.id] ?? true; // Default: true
                          return (
                            <td key={role.id} className="p-3 text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={hasAccess}
                                  onCheckedChange={(checked) => 
                                    handlePermissionChange(menu.id, role.id, checked === true)
                                  }
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MenuPermissionsPage;

