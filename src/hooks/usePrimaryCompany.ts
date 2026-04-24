import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface UserCompanyContext {
  company_id: string;
  company_name: string;
  role_type_description: string;
  is_primary: boolean;
}

export function usePrimaryCompany() {
  const { session, loading: sessionLoading } = useSession();
  const [primaryCompanyId, setPrimaryCompanyId] = useState<string | null>(null);
  const [primaryCompanyName, setPrimaryCompanyName] = useState<string | null>(null);
  const [loadingPrimaryCompany, setLoadingPrimaryCompany] = useState(true);
  const location = useLocation();
  // Usa apenas o user.id como dependência para evitar re-execuções desnecessárias
  const userId = session?.user?.id || null;

  useEffect(() => {
    const fetchPrimaryCompany = async () => {
      if (sessionLoading) {
        return; // Wait for session to load
      }

      // Para rotas públicas baseadas em companyId na URL (como /agendar e /guest-appointment),
      // não tentamos descobrir empresa primária nem mostrar warnings.
      const isPublicCompanyRoute =
        location.pathname.startsWith('/agendar/') ||
        location.pathname.startsWith('/guest-appointment/');

      if (!session?.user || isPublicCompanyRoute) {
        setPrimaryCompanyId(null);
        setPrimaryCompanyName(null);
        setLoadingPrimaryCompany(false);
        return;
      }

      setLoadingPrimaryCompany(true);
      try {
        const { data, error } = await supabase
          .rpc('get_user_context', { p_user_id: session.user.id });

        if (error) {
          console.error('usePrimaryCompany: Erro ao buscar contexto do usuário:', error);
          throw error;
        }

        const primaryCompany = data.find((company: UserCompanyContext) => company.is_primary);

        let foundCompanyId: string | null = null;
        let foundCompanyName: string | null = null;

        if (primaryCompany) {
          foundCompanyId = primaryCompany.company_id;
          foundCompanyName = primaryCompany.company_name;
        } else {
          // Se não encontrou empresa primária em user_companies, buscar qualquer empresa
          const anyCompany = data.find((company: UserCompanyContext) => company.company_id);
          if (anyCompany) {
            foundCompanyId = anyCompany.company_id;
            foundCompanyName = anyCompany.company_name;
          }
        }

        // Se não encontrou em user_companies, buscar em collaborators (para colaboradores)
        if (!foundCompanyId) {
          const { data: collaboratorData, error: collaboratorError } = await supabase
            .from('collaborators')
            .select('company_id')
            .eq('user_id', session.user.id)
            .eq('is_arena_system_placeholder', false)
            .limit(1)
            .maybeSingle();

          if (collaboratorError) {
            console.warn('usePrimaryCompany: Erro ao buscar collaborator (não crítico):', collaboratorError);
          }

          if (collaboratorData?.company_id) {
            foundCompanyId = collaboratorData.company_id;
          }
        }

        if (foundCompanyId) {
          setPrimaryCompanyId(foundCompanyId);

          // Se já temos o nome da empresa (de user_companies), usar diretamente
          if (foundCompanyName) {
            setPrimaryCompanyName(foundCompanyName);
          } else {
            // Se não temos o nome, buscar na tabela companies
            const { data: companyNameData, error: companyNameError } = await supabase
              .from('companies')
              .select('name')
              .eq('id', foundCompanyId)
              .single();

            if (companyNameError) {
              console.warn('usePrimaryCompany: Erro ao buscar nome da empresa (não crítico):', companyNameError);
              setPrimaryCompanyName(null);
            } else {
              setPrimaryCompanyName(companyNameData.name);
            }
          }
        } else {
          setPrimaryCompanyId(null);
          setPrimaryCompanyName(null);
        }

      } catch (error: any) {
        console.error('Error fetching primary company:', error);
        showError('Erro ao carregar empresa primária: ' + error.message);
        setPrimaryCompanyId(null);
        setPrimaryCompanyName(null);
      } finally {
        setLoadingPrimaryCompany(false);
      }
    };

    fetchPrimaryCompany();
  }, [userId, sessionLoading, location.pathname]); // Usa userId em vez de session inteiro

  return { primaryCompanyId, primaryCompanyName, loadingPrimaryCompany };
}