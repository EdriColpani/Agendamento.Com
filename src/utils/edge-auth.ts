import { supabase } from '@/integrations/supabase/client';
import { supabaseUrl } from '@/integrations/supabase/client';
import { clearSupabaseAuthStorage } from '@/utils/auth-state';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getProjectRefFromSupabaseUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

function getProjectRefFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const refClaim = payload.ref;
  if (typeof refClaim === 'string' && refClaim.trim()) {
    return refClaim;
  }

  const issClaim = payload.iss;
  if (typeof issClaim === 'string' && issClaim.trim()) {
    try {
      const host = new URL(issClaim).hostname;
      return host.split('.')[0] || null;
    } catch {
      return null;
    }
  }

  return null;
}

export function isSessionProjectMismatch(accessToken: string): boolean {
  const expectedRef = getProjectRefFromSupabaseUrl(supabaseUrl);
  const tokenRef = getProjectRefFromToken(accessToken);
  if (!expectedRef || !tokenRef) return false;
  return expectedRef !== tokenRef;
}

async function forceLocalSignOutOnProjectMismatch(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
  clearSupabaseAuthStorage();
}

/**
 * Retorna access token atual da sessão ativa.
 * Lança erro quando sessão estiver inválida/expirada.
 */
export async function requireCurrentAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  let session = data.session;
  let accessToken = session?.access_token;

  if (error || !accessToken) {
    throw new Error('Sessão expirada ou inválida. Faça login novamente.');
  }

  // Evita 401 em Edge Functions por token expirado/quase expirando.
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = session?.expires_at ?? 0;
  const isExpiredOrNearExpiry = !expiresAt || expiresAt - nowInSeconds <= 60;

  if (isExpiredOrNearExpiry) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    session = refreshData.session ?? null;
    accessToken = session?.access_token;

    if (refreshError || !accessToken) {
      throw new Error('Sessão expirada ou inválida. Faça login novamente.');
    }
  }

  if (isSessionProjectMismatch(accessToken)) {
    await forceLocalSignOutOnProjectMismatch();
    throw new Error('Sessão inválida para este ambiente. Faça login novamente.');
  }

  return accessToken;
}

