import { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

export function useIsGlobalAdmin() {
  const { session, loading: sessionLoading } = useSession();
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [loadingGlobalAdminCheck, setLoadingGlobalAdminCheck] = useState(true);
  // Usa apenas o user.id como dependência para evitar re-execuções desnecessárias
  const userId = session?.user?.id || null;

  useEffect(() => {
    const checkGlobalAdminStatus = async () => {
      if (sessionLoading) {
        return; // Wait for session to load
      }

      if (!session?.user) {
        setIsGlobalAdmin(false);
        setLoadingGlobalAdminCheck(false);
        return;
      }

      setLoadingGlobalAdminCheck(true);
      try {
        // Usar maybeSingle() para evitar erro 406
        const { data, error } = await supabase
          .from('type_user')
          .select('cod')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // Tratar erro 406 (Not Acceptable) - pode ser RLS, mas não é crítico
        if (error && error.code !== 'PGRST116' && error.code !== 'PGRST301') {
          console.warn('useIsGlobalAdmin: Erro ao buscar type_user (não crítico):', error);
        }

        const cod = (data?.cod || '').toUpperCase();
        const metadataRole = (session.user.user_metadata?.role || '').toUpperCase();

        // Aceita variações comuns para admin global
        const userIsGlobalAdmin = [
          'GLOBAL_ADMIN',
          'ADMIN_GLOBAL',
          'ADMINISTRADOR_GLOBAL',
          'SUPER_ADMIN',
        ].includes(cod) || metadataRole === 'GLOBAL_ADMIN';

        setIsGlobalAdmin(userIsGlobalAdmin);

      } catch (error: any) {
        console.error('Error checking global admin status:', error);
        showError('Erro ao verificar status de administrador global: ' + error.message);
        setIsGlobalAdmin(false);
      } finally {
        setLoadingGlobalAdminCheck(false);
      }
    };

    checkGlobalAdminStatus();
  }, [userId, sessionLoading]); // Usa userId em vez de session inteiro

  return { isGlobalAdmin, loadingGlobalAdminCheck };
}