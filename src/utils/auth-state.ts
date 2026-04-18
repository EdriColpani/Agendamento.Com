import { supabase } from '@/integrations/supabase/client';

// Módulo singleton para controlar estado de logout explícito
let explicitLogoutRequested = false;

export const markExplicitLogout = () => {
  explicitLogoutRequested = true;
};

export const checkAndClearExplicitLogout = (): boolean => {
  const wasExplicit = explicitLogoutRequested;
  explicitLogoutRequested = false; // Reset após verificação
  return wasExplicit;
};

/** Remove chaves de sessão do Supabase no browser (fallback se a API falhar). */
export function clearSupabaseAuthStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('auth'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    const sessionKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('auth'))) {
        sessionKeys.push(key);
      }
    }
    sessionKeys.forEach((key) => sessionStorage.removeItem(key));
  } catch (e) {
    console.error('clearSupabaseAuthStorage:', e);
  }
}

/**
 * Logout confiável no cliente.
 * Usa `scope: 'local'` para não chamar revogação global no servidor (evita 403 em POST /logout?scope=global em alguns projetos Supabase).
 */
export async function performSignOut(): Promise<void> {
  markExplicitLogout();
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      console.warn('signOut (local):', error.message);
    }
  } catch (e) {
    console.warn('signOut exception:', e);
  }
  clearSupabaseAuthStorage();
  try {
    await supabase.auth.getSession();
  } catch {
    /* ignore */
  }
}

