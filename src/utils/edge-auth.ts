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

export function isJwtClockSkewError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes('jwt issued at future') ||
    normalized.includes('issued in the future') ||
    normalized.includes('clock skew')
  );
}

export function getAuthErrorUserMessage(message: string | undefined): string {
  if (isJwtClockSkewError(message)) {
    return 'Relógio do computador dessincronizado. Ajuste data/hora do Windows para automático, sincronize e recarregue a página (F5).';
  }
  return message || 'Erro de autenticação.';
}

/** Atualiza sessão antes de queries autenticadas (expiração ou relógio local atrasado). */
export async function ensureValidSessionForQuery(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const session = data.session;
  if (!session?.access_token) {
    throw new Error('Sessão expirada ou inválida. Faça login novamente.');
  }

  const payload = decodeJwtPayload(session.access_token);
  const issuedAt = typeof payload?.iat === 'number' ? payload.iat : 0;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at ?? 0;
  const tokenLooksFromFuture = issuedAt > nowInSeconds + 30;
  const isExpiredOrNearExpiry = !expiresAt || expiresAt - nowInSeconds <= 60;

  if (!tokenLooksFromFuture && !isExpiredOrNearExpiry) {
    return;
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData.session?.access_token) {
    if (tokenLooksFromFuture) {
      throw new Error('JWT issued at future');
    }
    throw refreshError ?? new Error('Sessão expirada ou inválida. Faça login novamente.');
  }
}

