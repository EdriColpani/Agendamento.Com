/**
 * Hook para verificar se o usuário logado é um Proprietário
 * 
 * ROTINA BLINDADA - NÃO ALTERAR SEM AUTORIZAÇÃO
 * 
 * Esta rotina utiliza dois métodos de verificação:
 * 1. get_user_context (método principal) - verifica role_type_description na tabela user_companies
 * 2. type_user.cod (fallback) - verifica cod na tabela type_user
 * 
 * O usuário é considerado Proprietário se QUALQUER um dos métodos retornar positivo.
 */
import { useState, useEffect, useRef } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

export function useIsProprietario() {
  const { session, loading: sessionLoading } = useSession();
  const [isProprietario, setIsProprietario] = useState(false);
  const [loadingProprietarioCheck, setLoadingProprietarioCheck] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userId = session?.user?.id || null;

  useEffect(() => {
    // Cancelar requisições anteriores se o userId mudar
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const checkProprietarioStatus = async () => {
      // VALIDAÇÃO 1: Aguardar sessão carregar
      if (sessionLoading) {
        return;
      }

      // VALIDAÇÃO 2: Verificar se há usuário logado
      if (!session?.user?.id) {
        setIsProprietario(false);
        setLoadingProprietarioCheck(false);
        return;
      }

      setLoadingProprietarioCheck(true);
      
      try {
        const currentUserId = session.user.id;
        
        // MÉTODO PRINCIPAL: get_user_context (verifica user_companies.role_type)
        let isProprietarioByContext = false;
        try {
          const { data: contextData, error: contextError } = await supabase
            .rpc('get_user_context', { p_user_id: currentUserId });

          if (contextError) {
            console.warn('[useIsProprietario] Erro ao buscar get_user_context (tentando fallback):', contextError);
          } else if (Array.isArray(contextData) && contextData.length > 0) {
            // Verificar se algum role é exatamente 'Proprietário'
            isProprietarioByContext = contextData.some(role => {
              const roleDesc = role?.role_type_description || role?.description || '';
              const normalizedDesc = roleDesc.trim();
              return normalizedDesc === 'Proprietário';
            });
          }
        } catch (contextErr: any) {
          console.warn('[useIsProprietario] Exceção ao buscar get_user_context:', contextErr);
        }

        // MÉTODO FALLBACK: type_user.cod (verifica type_user.cod = 'PROPRIETARIO')
        let isProprietarioByType = false;
        try {
          const { data: typeUserData, error: typeUserError } = await supabase
            .from('type_user')
            .select('cod')
            .eq('user_id', currentUserId)
            .maybeSingle();

          // Ignorar erros 406 (PGRST301) e 404 (PGRST116) - são esperados em alguns casos
          if (typeUserError && typeUserError.code !== 'PGRST116' && typeUserError.code !== 'PGRST301') {
            console.warn('[useIsProprietario] Erro ao buscar type_user:', typeUserError);
          } else if (typeUserData?.cod === 'PROPRIETARIO') {
            isProprietarioByType = true;
          }
        } catch (typeErr: any) {
          console.warn('[useIsProprietario] Exceção ao buscar type_user:', typeErr);
        }

        // RESULTADO FINAL: usuário é proprietário se QUALQUER método retornar true
        const finalResult = isProprietarioByContext || isProprietarioByType;

        setIsProprietario(finalResult);

      } catch (error: any) {
        // Tratamento de erro genérico - nunca quebrar a aplicação
        console.error('[useIsProprietario] Erro crítico na verificação:', error);
        // Não mostrar erro ao usuário para não poluir a UI
        // Apenas definir como false (seguro por padrão)
        setIsProprietario(false);
      } finally {
        setLoadingProprietarioCheck(false);
      }
    };

    checkProprietarioStatus();

    // Cleanup: cancelar requisições se o componente desmontar
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [userId, sessionLoading, session?.user?.id]);

  return { isProprietario, loadingProprietarioCheck };
}