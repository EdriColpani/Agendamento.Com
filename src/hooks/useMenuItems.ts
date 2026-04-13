import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrimaryCompany } from './usePrimaryCompany';
import { useSession } from '@/components/SessionContextProvider';

export interface MenuItem {
  id: string;
  menu_key: string;
  label: string;
  icon: string;
  path: string;
  display_order: number;
}

export function useMenuItems() {
  const { session } = useSession();
  const { primaryCompanyId } = usePrimaryCompany();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMenuItems = useCallback(async () => {
    if (!session?.user) {
      setMenuItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Determinar companyId e roleTypeId
      let companyId = primaryCompanyId;
      let userRoleTypeId: number | null = null;

      console.log('[useMenuItems] Iniciando busca de menus para user_id:', session.user.id, 'primaryCompanyId:', primaryCompanyId);

      // Se não tem empresa primária, buscar em qualquer empresa ou na tabela collaborators
      if (!companyId) {
        console.log('[useMenuItems] primaryCompanyId não encontrado, buscando em user_companies...');
        // Tentar buscar em user_companies
        const { data: userCompanyData } = await supabase
          .from('user_companies')
          .select('company_id, role_type')
          .eq('user_id', session.user.id)
          .not('role_type', 'is', null)
          .limit(1)
          .maybeSingle();
        
        if (userCompanyData) {
          companyId = userCompanyData.company_id;
          userRoleTypeId = userCompanyData.role_type;
          console.log('[useMenuItems] ✅ Encontrado em user_companies:', { companyId, userRoleTypeId });
        } else {
          console.log('[useMenuItems] Não encontrado em user_companies, buscando em collaborators...');
          // Se não encontrou em user_companies, buscar em collaborators
          const { data: collaboratorData } = await supabase
            .from('collaborators')
            .select('company_id, role_type_id')
            .eq('user_id', session.user.id)
            .eq('is_arena_system_placeholder', false)
            .limit(1)
            .maybeSingle();
          
          if (collaboratorData) {
            companyId = collaboratorData.company_id;
            userRoleTypeId = collaboratorData.role_type_id;
            console.log('[useMenuItems] ✅ Encontrado em collaborators:', { companyId, userRoleTypeId });
          } else {
            console.warn('[useMenuItems] ⚠️ Não encontrado nem em user_companies nem em collaborators');
          }
        }
      } else {
        console.log('[useMenuItems] Usando primaryCompanyId:', companyId);
      }

      if (!companyId) {
        // Se não encontrou empresa, não mostrar menus
        setMenuItems([]);
        setLoading(false);
        return;
      }

      // 1. Buscar plano ativo da empresa
      const { data: subscriptionData, error: subError } = await supabase
        .from('company_subscriptions')
        .select('plan_id')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError && subError.code !== 'PGRST116') {
        throw subError;
      }

      const planId = subscriptionData?.plan_id;
      console.log('[useMenuItems] Plano ativo encontrado:', planId);
      
      if (!planId) {
        // Se não tem plano ativo, retornar array vazio
        console.warn('[useMenuItems] ⚠️ Empresa sem plano ativo');
        setMenuItems([]);
        setLoading(false);
        return;
      }

      // 2. Buscar menus vinculados ao plano
      console.log('[useMenuItems] Buscando menus do plano:', planId);
      const { data: menuPlansData, error: menuPlansError } = await supabase
        .from('menu_plans')
        .select('menu_id, menus(id, menu_key, label, icon, path, display_order, is_active)')
        .eq('plan_id', planId);

      if (menuPlansError) {
        console.error('[useMenuItems] Erro ao buscar menus do plano:', menuPlansError);
        throw menuPlansError;
      }

      const availableMenus = (menuPlansData || [])
        .map((mp: any) => mp.menus)
        .filter((menu: any) => menu && menu.is_active === true) as MenuItem[];

      console.log('[useMenuItems] Menus disponíveis no plano:', availableMenus.map(m => m.menu_key));

      if (availableMenus.length === 0) {
        console.warn('[useMenuItems] ⚠️ Nenhum menu ativo encontrado no plano');
        setMenuItems([]);
        setLoading(false);
        return;
      }

      // 3. Se ainda não tem roleTypeId, buscar na empresa encontrada
      if (!userRoleTypeId) {
        console.log('[useMenuItems] Buscando roleTypeId em user_companies...');
        const { data: userCompanyData, error: userCompanyError } = await supabase
          .from('user_companies')
          .select('role_type')
          .eq('user_id', session.user.id)
          .eq('company_id', companyId)
          .maybeSingle();

        if (userCompanyError && userCompanyError.code !== 'PGRST116') {
          console.warn('[useMenuItems] Erro ao buscar em user_companies:', userCompanyError);
        }

        userRoleTypeId = userCompanyData?.role_type || null;
        console.log('[useMenuItems] roleTypeId de user_companies:', userRoleTypeId);
      }

      // 4. Se ainda não tem roleTypeId, buscar em collaborators (para colaboradores)
      if (!userRoleTypeId) {
        console.log('[useMenuItems] Buscando roleTypeId em collaborators...');
        const { data: collaboratorData, error: collaboratorError } = await supabase
          .from('collaborators')
          .select('role_type_id')
          .eq('user_id', session.user.id)
          .eq('company_id', companyId)
          .eq('is_arena_system_placeholder', false)
          .maybeSingle();

        if (collaboratorError && collaboratorError.code !== 'PGRST116') {
          console.warn('[useMenuItems] Erro ao buscar em collaborators:', collaboratorError);
        }

        userRoleTypeId = collaboratorData?.role_type_id || null;
        console.log('[useMenuItems] roleTypeId de collaborators:', userRoleTypeId);
      }

      if (!userRoleTypeId) {
        // Se usuário não tem role na empresa, não mostrar menus
        console.warn('[useMenuItems] ⚠️ Usuário sem role_type_id - não será possível filtrar menus por permissão');
        setMenuItems([]);
        setLoading(false);
        return;
      }

      console.log('[useMenuItems] ✅ roleTypeId final:', userRoleTypeId, 'companyId:', companyId);

      // 5. Buscar permissões do usuário para os menus
      const menuIds = availableMenus.map(m => m.id);
      console.log('[useMenuItems] Buscando permissões para:', {
        companyId,
        roleTypeId: userRoleTypeId,
        menuIds: menuIds.length,
        menuKeys: availableMenus.map(m => m.menu_key)
      });

      const { data: permissionsData, error: permissionsError } = await supabase
        .from('menu_role_permissions')
        .select('menu_id, has_access')
        .eq('company_id', companyId)
        .eq('role_type_id', userRoleTypeId)
        .in('menu_id', menuIds);

      if (permissionsError) {
        console.error('[useMenuItems] Erro ao buscar permissões:', permissionsError);
        throw permissionsError;
      }

      console.log('[useMenuItems] Permissões encontradas:', permissionsData);

      // Criar mapa de permissões: menu_id -> has_access
      // IMPORTANTE: Converter IDs para string para garantir comparação correta
      const permissionsMap = new Map<string, boolean>();
      (permissionsData || []).forEach((perm: any) => {
        const menuIdStr = String(perm.menu_id);
        permissionsMap.set(menuIdStr, perm.has_access);
        console.log(`[useMenuItems] Permissão adicionada: menu_id=${menuIdStr} (tipo: ${typeof menuIdStr}), has_access=${perm.has_access}`);
      });

      console.log('[useMenuItems] Total de permissões no mapa:', permissionsMap.size);
      console.log('[useMenuItems] Chaves no mapa:', Array.from(permissionsMap.keys()));

      // 6. Filtrar menus permitidos
      // Lógica: Se has_access = true OU não está definido (NULL) → PERMITE
      //         Se has_access = false → BLOQUEIA
      const allowedMenus = availableMenus.filter(menu => {
        const menuIdStr = String(menu.id);
        const hasAccess = permissionsMap.get(menuIdStr);
        
        // Se não está no mapa (NULL no banco), permite por padrão
        // Se está no mapa e é true, permite
        // Se está no mapa e é false, bloqueia
        const isAllowed = hasAccess === undefined || hasAccess === true;
        
        console.log(`[useMenuItems] Menu ${menu.menu_key} (id: ${menuIdStr}):`, {
          hasAccess,
          tipo: typeof hasAccess,
          isAllowed,
          noMapa: permissionsMap.has(menuIdStr)
        });
        
        if (!isAllowed) {
          console.warn(`[useMenuItems] ⚠️ Menu ${menu.menu_key} foi BLOQUEADO (hasAccess=${hasAccess}, tipo=${typeof hasAccess})`);
        } else {
          console.log(`[useMenuItems] ✅ Menu ${menu.menu_key} foi PERMITIDO`);
        }
        
        return isAllowed;
      });

      console.log('[useMenuItems] Menus permitidos:', allowedMenus.map(m => m.menu_key));

      // 6. Ordenar por display_order
      const sortedMenus = allowedMenus.sort((a, b) => a.display_order - b.display_order);

      setMenuItems(sortedMenus);
    } catch (error: any) {
      console.error('Erro ao buscar menus:', error);
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }, [session, primaryCompanyId]);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  return { menuItems, loading, refetch: fetchMenuItems };
}

