import { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';

export function useIsCollaborator() {
  const { session, loading: sessionLoading } = useSession();
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkCollaboratorStatus = async () => {
      if (sessionLoading) {
        return;
      }

      if (!session?.user) {
        setIsCollaborator(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Verificar se o usuário tem type_user.cod = 'COLABORADOR'
        const { data: typeUserData, error: typeUserError } = await supabase
          .from('type_user')
          .select('cod')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (typeUserError && typeUserError.code !== 'PGRST116') {
          console.warn('useIsCollaborator: Erro ao buscar type_user (não crítico):', typeUserError);
        }

        const cod = (typeUserData?.cod || '').toUpperCase();
        const isColab = cod === 'COLABORADOR';

        // Se não encontrou em type_user, verificar se existe em collaborators
        if (!isColab) {
          const { data: collaboratorData, error: collaboratorError } = await supabase
            .from('collaborators')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('is_arena_system_placeholder', false)
            .limit(1)
            .maybeSingle();

          if (collaboratorError && collaboratorError.code !== 'PGRST116') {
            console.warn('useIsCollaborator: Erro ao buscar collaborator (não crítico):', collaboratorError);
          }

          setIsCollaborator(!!collaboratorData);
        } else {
          setIsCollaborator(true);
        }
      } catch (error: any) {
        console.error('Error checking collaborator status:', error);
        setIsCollaborator(false);
      } finally {
        setLoading(false);
      }
    };

    checkCollaboratorStatus();
  }, [session, sessionLoading]);

  return { isCollaborator, loading };
}

