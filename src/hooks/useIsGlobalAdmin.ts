import { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ensureValidSessionForQuery, getAuthErrorUserMessage, isJwtClockSkewError } from '@/utils/edge-auth';

export function useIsGlobalAdmin() {
  const { session, loading: sessionLoading } = useSession();
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [loadingGlobalAdminCheck, setLoadingGlobalAdminCheck] = useState(true);
  const userId = session?.user?.id || null;

  useEffect(() => {
    const checkGlobalAdminStatus = async () => {
      if (sessionLoading) {
        return;
      }

      if (!session?.user) {
        setIsGlobalAdmin(false);
        setLoadingGlobalAdminCheck(false);
        return;
      }

      setLoadingGlobalAdminCheck(true);
      try {
        await ensureValidSessionForQuery();

        const { data, error } = await supabase
          .from('type_user')
          .select('cod')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116' && error.code !== 'PGRST301') {
          console.warn('useIsGlobalAdmin: Erro ao buscar type_user (não crítico):', error);
        }

        const cod = (data?.cod || '').toUpperCase();
        const metadataRole = (session.user.user_metadata?.role || '').toUpperCase();

        const userIsGlobalAdmin =
          ['GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN'].includes(cod) ||
          metadataRole === 'GLOBAL_ADMIN';

        setIsGlobalAdmin(userIsGlobalAdmin);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error checking global admin status:', error);

        if (isJwtClockSkewError(message)) {
          showError(getAuthErrorUserMessage(message));
        } else {
          showError('Erro ao verificar status de administrador global: ' + getAuthErrorUserMessage(message));
        }

        setIsGlobalAdmin(false);
      } finally {
        setLoadingGlobalAdminCheck(false);
      }
    };

    checkGlobalAdminStatus();
  }, [userId, sessionLoading]);

  return { isGlobalAdmin, loadingGlobalAdminCheck };
}