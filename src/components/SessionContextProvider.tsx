import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { showSuccess, showError } from '@/utils/toast';
import { getTargetCompanyId, clearTargetCompanyId } from '@/utils/storage'; // Import storage utils
import { checkAndClearExplicitLogout, clearSupabaseAuthStorage } from '@/utils/auth-state'; // Import para verificar logout explícito
import { isSessionProjectMismatch } from '@/utils/edge-auth';

interface SessionContextType {
  session: Session | null;
  loading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Usamos useRef para rastrear se o usuário já estava logado, evitando toasts repetidos em revalidações.
  const isUserLoggedInRef = useRef(false);
  // Flag para rastrear se ainda estamos na fase de inicialização (restauração da sessão)
  const isInitializingRef = useRef(true);
  // Ref para manter a sessão anterior e comparar mudanças reais
  const previousSessionRef = useRef<Session | null>(null);
  const navigate = useNavigate();

  // Função helper para verificar se a sessão realmente mudou (mudança de usuário)
  const hasSessionChanged = (prevSession: Session | null, newSession: Session | null): boolean => {
    // Se ambas são null, não mudou
    if (!prevSession && !newSession) return false;
    // Se uma é null e outra não, mudou
    if (!prevSession || !newSession) return true;
    // Compara o ID do usuário - se for diferente, é uma mudança real
    return prevSession.user.id !== newSession.user.id;
  };

  const handleProjectSessionMismatch = async () => {
    clearTargetCompanyId();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore
    }
    clearSupabaseAuthStorage();
    setSession(null);
    previousSessionRef.current = null;
    isUserLoggedInRef.current = false;
    showError('Sessão inválida para este ambiente. Faça login novamente.');
    navigate('/login', { replace: true });
  };

  /** Link de e-mail (confirmação / recovery) coloca tokens no hash; getSession() pode ainda ser null nesse tick. */
  const hasAuthCallbackInUrl = (): boolean => {
    if (typeof window === 'undefined') return false;
    const { hash, search } = window.location;
    return (
      hash.includes('access_token=') ||
      hash.includes('type=recovery') ||
      hash.includes('type=signup') ||
      search.includes('code=')
    );
  };

  const resolveSessionAfterUrl = async (first: Session | null): Promise<Session | null> => {
    if (first) return first;
    if (!hasAuthCallbackInUrl()) return null;
    for (let i = 0; i < 6; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 80 * i));
      }
      const { data: { session: next } } = await supabase.auth.getSession();
      if (next) return next;
    }
    return null;
  };

  useEffect(() => {
    let mounted = true;

    // Configura o listener de mudanças de autenticação ANTES de chamar getSession
    // para capturar todos os eventos, mas vamos ignorar os que ocorrem durante a inicialização
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        
        const isInitializing = isInitializingRef.current;
        
        console.log('SessionContextProvider - Auth event:', event, 'Session:', currentSession, 'IsInitializing:', isInitializing);
        
        if (currentSession?.access_token && isSessionProjectMismatch(currentSession.access_token)) {
          await handleProjectSessionMismatch();
          return;
        }

        // Durante a inicialização, ignora TODOS os eventos do listener
        // A sessão será definida apenas pelo resultado do getSession()
        if (isInitializing) {
          console.log('SessionContextProvider - Ignorando evento durante inicialização:', event);
          return;
        }
        
        // Após a inicialização, processa os eventos normalmente
        const wasLoggedIn = isUserLoggedInRef.current;
        const previousSession = previousSessionRef.current;
        
        // Verifica se o usuário realmente mudou
        const userChanged = hasSessionChanged(previousSession, currentSession);
        
        // Ignora eventos TOKEN_REFRESHED e SIGNED_IN se o usuário não mudou (evita resetar a aplicação)
        // SIGNED_IN pode ser disparado novamente quando a aba volta ao foco, mesmo sendo o mesmo usuário
        const isTokenRefresh = event === 'TOKEN_REFRESHED';
        const isSignedIn = event === 'SIGNED_IN';
        const isSignedOut = event === 'SIGNED_OUT';
        const isUserUpdated = event === 'USER_UPDATED';
        const isPasswordRecovery = event === 'PASSWORD_RECOVERY';
        
        // Se for refresh de token ou SIGNED_IN repetido e o usuário não mudou, ignora completamente
        // para evitar re-renderizações desnecessárias que resetam a aplicação
        if ((isTokenRefresh || (isSignedIn && wasLoggedIn)) && !userChanged) {
          console.log(`SessionContextProvider - Ignorando ${event} - usuário não mudou (já estava logado), evitando re-render`);
          // Atualiza apenas a referência da sessão sem causar re-render
          previousSessionRef.current = currentSession;
          return;
        }
        
        // Para eventos críticos ou mudanças reais de usuário, atualiza a sessão
        // Isso garante que eventos importantes sempre sejam processados
        const shouldUpdateSession = isSignedOut || isUserUpdated || isPasswordRecovery || userChanged || (isSignedIn && !wasLoggedIn);
        
        if (shouldUpdateSession) {
          setSession(currentSession);
          previousSessionRef.current = currentSession;
        } else {
          // Mesmo que não atualize o estado, mantém a referência atualizada
          previousSessionRef.current = currentSession;
        }

        if (currentSession) {
          isUserLoggedInRef.current = true;
        } else {
          isUserLoggedInRef.current = false;
        }

        // Processa eventos específicos
        if (event === 'SIGNED_OUT') {
          // Verifica se foi logout explícito
          const wasExplicitLogout = checkAndClearExplicitLogout();
          if (wasExplicitLogout) {
            // Logout explícito: mostra mensagem e redireciona
            showSuccess('Logout realizado com sucesso!');
            clearTargetCompanyId(); // Limpa qualquer empresa alvo pendente no logout
            navigate('/', { replace: true });
          }
          // Se não foi explícito (expiração, refresh silencioso, etc.), apenas limpa a sessão
          // sem redirecionar - os guards vão cuidar do redirecionamento se necessário
          return;
        }

        if (event === 'SIGNED_IN' && currentSession) {
          // Só mostra o toast de sucesso se for um login fresco (não uma revalidação de token)
          if (!wasLoggedIn) {
            showSuccess('Login realizado com sucesso!');
          }
          
          const targetCompanyId = getTargetCompanyId();
          
          if (targetCompanyId) {
            // Se uma empresa alvo estiver definida, redireciona para a página de agendamento do cliente.
            navigate('/agendar', { replace: true });
            return;
          }
          
          // Se não houver empresa alvo, não faz nenhum redirecionamento aqui.
          // O IndexPage, componente pai, será responsável por direcionar o usuário com base no papel.
          // navigate('/', { replace: true }); // Removido

        } else if (event === 'PASSWORD_RECOVERY') {
          showSuccess('Verifique seu e-mail para redefinir a senha.');
        } else if (event === 'USER_UPDATED') {
          showSuccess('Seu perfil foi atualizado!');
        }
      }
    );

    // Restaura a sessão; se veio de link de e-mail (#access_token), reconsulta após o cliente trocar o hash pela sessão.
    void (async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!mounted) return;

      const finalSession = await resolveSessionAfterUrl(initialSession);

      if (finalSession?.access_token && isSessionProjectMismatch(finalSession.access_token)) {
        await handleProjectSessionMismatch();
        isInitializingRef.current = false;
        setLoading(false);
        return;
      }

      setSession(finalSession);
      previousSessionRef.current = finalSession;
      isUserLoggedInRef.current = !!finalSession;
      isInitializingRef.current = false;
      setLoading(false);
    })();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]); // Dependências corrigidas: apenas 'navigate'

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};