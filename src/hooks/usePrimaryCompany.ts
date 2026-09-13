import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { ensureValidSessionForQuery, getAuthErrorUserMessage, isJwtClockSkewError } from '@/utils/edge-auth';
import {
  clearPrimaryCompanyCacheForUser,
  isPrimaryCompanyCacheReady,
  readPrimaryCompanyCache,
  writePrimaryCompanyCache,
} from '@/hooks/companyDataCache';

interface UserCompanyContext {
  company_id: string;
  company_name: string;
  role_type_description: string;
  is_primary: boolean;
}

export function usePrimaryCompany() {
  const { session, loading: sessionLoading } = useSession();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const userId = session?.user?.id || null;
  const cachedOnMount = readPrimaryCompanyCache(userId);

  const [primaryCompanyId, setPrimaryCompanyId] = useState<string | null>(cachedOnMount.companyId);
  const [primaryCompanyName, setPrimaryCompanyName] = useState<string | null>(cachedOnMount.companyName);
  const [loadingPrimaryCompany, setLoadingPrimaryCompany] = useState(
    () => !!userId && !isPrimaryCompanyCacheReady(userId),
  );
  const location = useLocation();
  const primaryCompanyIdRef = useRef<string | null>(primaryCompanyId);
  primaryCompanyIdRef.current = primaryCompanyId;

  const skipPrimaryCompanyFetch = useMemo(() => {
    if (!session?.user) return true;
    if (location.pathname.startsWith('/agendar/')) return true;
    if (location.pathname.startsWith('/guest-appointment/')) return true;
    if (location.pathname.startsWith('/admin-dashboard')) return true;
    const metadataRole = (session.user.user_metadata?.role || '').toUpperCase();
    if (metadataRole === 'GLOBAL_ADMIN') return true;
    if (isGlobalAdmin) return true;
    return false;
  }, [session?.user, location.pathname, isGlobalAdmin]);

  useEffect(() => {
    if (!userId) {
      clearPrimaryCompanyCacheForUser(null);
    }
  }, [userId]);

  useEffect(() => {
    const fetchPrimaryCompany = async () => {
      if (sessionLoading || loadingGlobalAdminCheck) {
        return;
      }

      if (skipPrimaryCompanyFetch) {
        setPrimaryCompanyId(null);
        setPrimaryCompanyName(null);
        setLoadingPrimaryCompany(false);
        return;
      }

      if (userId && isPrimaryCompanyCacheReady(userId)) {
        const cached = readPrimaryCompanyCache(userId);
        setPrimaryCompanyId(cached.companyId);
        setPrimaryCompanyName(cached.companyName);
        setLoadingPrimaryCompany(false);
        return;
      }

      const isInitialLoad = primaryCompanyIdRef.current === null;
      if (isInitialLoad) {
        setLoadingPrimaryCompany(true);
      }

      try {
        await ensureValidSessionForQuery();

        const { data, error } = await supabase.rpc('get_user_context', { p_user_id: session!.user.id });

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
          const anyCompany = data.find((company: UserCompanyContext) => company.company_id);
          if (anyCompany) {
            foundCompanyId = anyCompany.company_id;
            foundCompanyName = anyCompany.company_name;
          }
        }

        if (!foundCompanyId) {
          const { data: collaboratorData, error: collaboratorError } = await supabase
            .from('collaborators')
            .select('company_id')
            .eq('user_id', session!.user.id)
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

        let resolvedCompanyName = foundCompanyName;

        if (foundCompanyId) {
          setPrimaryCompanyId(foundCompanyId);

          if (foundCompanyName) {
            setPrimaryCompanyName(foundCompanyName);
          } else {
            const { data: companyNameData, error: companyNameError } = await supabase
              .from('companies')
              .select('name')
              .eq('id', foundCompanyId)
              .single();

            if (companyNameError) {
              console.warn('usePrimaryCompany: Erro ao buscar nome da empresa (não crítico):', companyNameError);
              setPrimaryCompanyName(null);
              resolvedCompanyName = null;
            } else {
              setPrimaryCompanyName(companyNameData.name);
              resolvedCompanyName = companyNameData.name;
            }
          }
        } else {
          setPrimaryCompanyId(null);
          setPrimaryCompanyName(null);
        }

        if (userId) {
          writePrimaryCompanyCache(userId, foundCompanyId, resolvedCompanyName);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error fetching primary company:', error);

        if (!isJwtClockSkewError(message)) {
          showError('Erro ao carregar empresa primária: ' + getAuthErrorUserMessage(message));
        }

        setPrimaryCompanyId(null);
        setPrimaryCompanyName(null);
        if (userId) {
          clearPrimaryCompanyCacheForUser(userId);
        }
      } finally {
        setLoadingPrimaryCompany(false);
      }
    };

    fetchPrimaryCompany();
  }, [userId, sessionLoading, loadingGlobalAdminCheck, skipPrimaryCompanyFetch]);

  return { primaryCompanyId, primaryCompanyName, loadingPrimaryCompany };
}
