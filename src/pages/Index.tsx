/**
 * Página Index - Roteamento baseado em roles de usuário
 * 
 * ROTINA BLINDADA - NÃO ALTERAR SEM AUTORIZAÇÃO
 * 
 * Esta página é responsável por redirecionar usuários logados para suas respectivas dashboards
 * baseado em seus roles. A ordem de prioridade é:
 * 1. Validação de Vínculo: Verifica se usuário possui vínculo válido (user_companies ou collaborators)
 *    - Se não tiver vínculo -> /waiting-approval
 * 2. Proprietário -> /dashboard (MÁXIMA PRIORIDADE)
 * 3. Global Admin -> /admin-dashboard
 * 4. Company Admin -> /dashboard
 * 5. Colaborador -> Verifica se tem role_type:
 *    - Se tem role_type -> /dashboard (menus filtrados por permissões)
 *    - Se não tem role_type -> /colaborador/agendamentos
 * 6. Cliente -> /meus-agendamentos
 * 
 * Usuários sem sessão ou sem role definido permanecem na LandingPage.
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { useIsProprietario } from '@/hooks/useIsProprietario';
import { useIsCompanyAdmin } from '@/hooks/useIsCompanyAdmin';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { useIsClient } from '@/hooks/useIsClient';
import { useIsCollaborator } from '@/hooks/useIsCollaborator';
import { useUserValidation } from '@/hooks/useUserValidation';
import { supabase } from '@/integrations/supabase/client';
import { useMenuItems } from '@/hooks/useMenuItems';
import LandingPage from './LandingPage';

const IndexPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { hasValidLink, loading: loadingValidation, company_id } = useUserValidation();
  const { isProprietario, loadingProprietarioCheck } = useIsProprietario();
  const { isCompanyAdmin, loadingCompanyAdminCheck } = useIsCompanyAdmin();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const { isClient, loadingClientCheck } = useIsClient();
  const { isCollaborator, loading: loadingCollaboratorCheck } = useIsCollaborator();
  const { menuItems: dynamicMenuItems, loading: loadingMenus } = useMenuItems();
  const loadingRoles = loadingProprietarioCheck || loadingCompanyAdminCheck || loadingGlobalAdminCheck || loadingClientCheck || loadingCollaboratorCheck;
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // VALIDAÇÃO 1: Aguardar sessão carregar
    if (sessionLoading) {
      return;
    }

    // VALIDAÇÃO 2: Se não tem sessão, renderizar LandingPage (público)
    if (!session) {
      hasRedirectedRef.current = false;
      return; 
    }

    // VALIDAÇÃO 3: Aguardar validação de vínculo
    if (loadingValidation) {
      return;
    }

    // VALIDAÇÃO 4: Verificar se usuário possui vínculo válido
    // Se não tiver vínculo, redirecionar para página de aprovação
    // EXCEÇÃO: Global Admin não precisa de vínculo com empresa
    if (!hasValidLink && !isGlobalAdmin) {
      console.log('[IndexPage] Usuário sem vínculo válido - redirecionando para /waiting-approval');
      hasRedirectedRef.current = true;
      navigate('/waiting-approval', { replace: true });
      return;
    }

    // VALIDAÇÃO 5: Aguardar até que TODOS os roles terminem de carregar
    // CRÍTICO: Não redirecionar antes de ter certeza dos roles
    if (loadingRoles) {
      return;
    }

    // Proteção contra múltiplos redirecionamentos
    if (hasRedirectedRef.current) {
      return;
    }

    // PRIORIDADE 1: PROPRIETÁRIO (MÁXIMA PRIORIDADE - SEMPRE redirecionar para /dashboard)
    if (isProprietario === true) {
      console.log('[IndexPage] PROPRIETÁRIO detectado - redirecionando para /dashboard');
      hasRedirectedRef.current = true;
      navigate('/dashboard', { replace: true });
      return;
    }

    // PRIORIDADE 2: Global Admin
    if (isGlobalAdmin === true) {
      console.log('[IndexPage] GLOBAL_ADMIN detectado - redirecionando para /admin-dashboard');
      hasRedirectedRef.current = true;
      navigate('/admin-dashboard', { replace: true });
      return;
    }

    // PRIORIDADE 3: Company Admin
    if (isCompanyAdmin === true) {
      console.log('[IndexPage] CompanyAdmin detectado - redirecionando para /dashboard');
      hasRedirectedRef.current = true;
      navigate('/dashboard', { replace: true });
      return;
    }

    // PRIORIDADE 4: Colaborador
    // Verificar se o colaborador tem role_type (primeiro na empresa primária, depois em qualquer empresa, depois na tabela collaborators)
    if (isCollaborator === true) {
      // Para colaboradores, também precisamos aguardar os menus dinâmicos,
      // pois o redirecionamento passa a respeitar as permissões de menu
      if (loadingMenus) {
        console.log('[IndexPage] Aguardando carregamento de menus para colaborador antes de redirecionar...');
        return;
      }

      console.log('[IndexPage] Menus carregados para colaborador:', dynamicMenuItems.map(m => ({
        id: m.id,
        key: m.menu_key,
        label: m.label,
        path: m.path,
      })));

      const checkCollaboratorRole = async () => {
        try {
          // 1. Tentar buscar role_type na empresa primária
          const { data: primaryCompanyData } = await supabase
            .from('user_companies')
            .select('role_type, company_id, is_primary')
            .eq('user_id', session.user.id)
            .eq('is_primary', true)
            .maybeSingle();

          let hasRoleType = primaryCompanyData?.role_type;

          // 2. Se não encontrou empresa primária ou não tem role_type, buscar em qualquer empresa
          if (!hasRoleType) {
            const { data: anyCompanyData } = await supabase
              .from('user_companies')
              .select('role_type, company_id, is_primary')
              .eq('user_id', session.user.id)
              .not('role_type', 'is', null)
              .limit(1)
              .maybeSingle();
            
            hasRoleType = anyCompanyData?.role_type;
          }

          // 3. Se ainda não encontrou, verificar na tabela collaborators
          if (!hasRoleType) {
            const { data: collaboratorData } = await supabase
              .from('collaborators')
              .select('role_type_id, company_id')
              .eq('user_id', session.user.id)
              .eq('is_arena_system_placeholder', false)
              .limit(1)
              .maybeSingle();
            
            hasRoleType = !!collaboratorData?.role_type_id;
          }

          // 4. Decisão final baseada no que foi encontrado
          if (hasRoleType) {
            // Novo comportamento: respeitar permissões de menu do colaborador
            // 1) Se tiver menu de dashboard liberado, manda para /dashboard
            const dashboardMenu = dynamicMenuItems.find(m => m.path && m.path.includes('/dashboard'));
            // 2) Caso contrário, usar o primeiro menu permitido como rota inicial
            const firstAllowedMenuPath = dashboardMenu?.path || dynamicMenuItems[0]?.path || '/colaborador/agendamentos';

            console.log('[IndexPage] COLABORADOR com role_type detectado - redirecionando para rota permitida:', {
              hasDashboardMenu: !!dashboardMenu,
              targetPath: firstAllowedMenuPath,
            });

            hasRedirectedRef.current = true;
            navigate(firstAllowedMenuPath, { replace: true });
          } else {
            // Se não tem role_type em nenhum lugar, é um colaborador básico
            console.log('[IndexPage] COLABORADOR sem role_type detectado - redirecionando para /colaborador/agendamentos');
            hasRedirectedRef.current = true;
            navigate('/colaborador/agendamentos', { replace: true });
          }
        } catch (error) {
          console.error('[IndexPage] Erro ao verificar role_type do colaborador:', error);
          // Em caso de erro, redirecionar para tela de agendamentos (comportamento padrão)
          hasRedirectedRef.current = true;
          navigate('/colaborador/agendamentos', { replace: true });
        }
      };
      
      checkCollaboratorRole();
      return;
    }

    // PRIORIDADE 5: Cliente
    if (isClient === true) {
      console.log('[IndexPage] Cliente detectado - redirecionando para /meus-agendamentos');
      hasRedirectedRef.current = true;
      navigate('/meus-agendamentos', { replace: true });
      return;
    }

    // Se chegou aqui, usuário está logado mas não tem role definido
    // Não redirecionar automaticamente - deixar na LandingPage
    console.log('[IndexPage] Usuário logado mas sem role definido - permanecendo na LandingPage');
    hasRedirectedRef.current = false;
  }, [session, sessionLoading, loadingValidation, hasValidLink, loadingRoles, isGlobalAdmin, isProprietario, isCompanyAdmin, isClient, isCollaborator, navigate]);

  // Reset do flag quando a sessão mudar
  useEffect(() => {
    if (!session) {
      hasRedirectedRef.current = false;
    }
  }, [session]);

  // Se está carregando sessão, validação de vínculo ou roles, mostrar loading
  if (sessionLoading || (session && (loadingValidation || loadingRoles))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Verificando permissões...</p>
      </div>
    );
  }

  // Se usuário está logado e é PROPRIETÁRIO, NUNCA renderizar LandingPage
  // Mostrar "Redirecionando..." enquanto o navigate executa
  if (session && !loadingRoles && isProprietario) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Redirecionando para dashboard...</p>
      </div>
    );
  }

  // Se usuário está logado e tem outro papel definido, aguardar redirecionamento
  if (session && !loadingRoles && (isGlobalAdmin || isCompanyAdmin || isClient || isCollaborator)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Redirecionando...</p>
      </div>
    );
  }

  // Se não tem sessão OU tem sessão mas não tem papel definido, renderizar LandingPage
  return <LandingPage />;
};

export default IndexPage;