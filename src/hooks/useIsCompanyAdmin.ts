import { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

export function useIsCompanyAdmin() {
  const { session, loading: sessionLoading } = useSession();
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [loadingCompanyAdminCheck, setLoadingCompanyAdminCheck] = useState(true);
  // Usa apenas o user.id como dependência para evitar re-execuções desnecessárias
  const userId = session?.user?.id || null;

  useEffect(() => {
    const checkCompanyAdminStatus = async () => {
      if (sessionLoading) {
        return; // Wait for session to load
      }

      if (!session?.user) {
        setIsCompanyAdmin(false);
        setLoadingCompanyAdminCheck(false);
        return;
      }

      setLoadingCompanyAdminCheck(true);
      try {
        // Fetch user's roles from user_companies table using the get_user_context function
        const { data, error } = await supabase
          .rpc('get_user_context', { p_user_id: session.user.id });

        if (error) {
          throw error;
        }

        // Considera variações de descrição para gestor/admin de empresa
        const userIsCompanyAdmin = data.some(role => {
          const desc = (role.role_type_description || '').toLowerCase();
          return [
            'admin',
            'administrador',
            'gestor',
            'gestor de evento',
            'manager',
          ].includes(desc);
        });
        setIsCompanyAdmin(userIsCompanyAdmin);

      } catch (error: any) {
        console.error('Error checking company admin status:', error);
        showError('Erro ao verificar status de administrador da empresa: ' + error.message);
        setIsCompanyAdmin(false);
      } finally {
        setLoadingCompanyAdminCheck(false);
      }
    };

    checkCompanyAdminStatus();
  }, [userId, sessionLoading]); // Usa userId em vez de session inteiro

  return { isCompanyAdmin, loadingCompanyAdminCheck };
}