import { supabase } from '@/integrations/supabase/client';

export type WhatsAppInstanceStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type WhatsAppEvolutionAction =
  | 'ensure'
  | 'get'
  | 'connect'
  | 'disconnect'
  | 'sync_status'
  | 'get_qr';

export interface WhatsAppInstance {
  id: string;
  company_id: string;
  instance_name: string;
  provider: string;
  status: WhatsAppInstanceStatus;
  connected_phone: string | null;
  connected_at: string | null;
  last_activity_at: string | null;
  last_disconnected_at: string | null;
  last_error: string | null;
  last_error_at?: string | null;
}

type EdgeResponse = {
  success?: boolean;
  error?: string;
  instance?: WhatsAppInstance | null;
  qr?: string | null;
  pairingCode?: string | null;
  instance_name?: string;
  status?: string;
};

export async function callWhatsAppEvolutionInstance(
  action: WhatsAppEvolutionAction,
  companyId: string,
): Promise<EdgeResponse> {
  const { data, error } = await supabase.functions.invoke('whatsapp-evolution-instance', {
    body: { action, company_id: companyId },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = await ctx.json();
        const msg = (body as EdgeResponse)?.error || (body as { message?: string })?.message;
        if (msg) throw new Error(msg);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) {
          throw parseErr;
        }
      }
    }
    throw new Error(
      error.message?.includes('Failed to fetch') || error.message?.includes('FunctionsFetchError')
        ? 'Não foi possível contactar o servidor. Verifique a URL do Supabase no .env e reinicie o dev server.'
        : error.message || 'Falha ao comunicar com o servidor WhatsApp.',
    );
  }

  const payload = (data ?? {}) as EdgeResponse;
  if (payload.error || payload.success === false) {
    throw new Error(payload.error || 'Operação WhatsApp falhou.');
  }

  return payload;
}

/** Converte retorno da Evolution (base64 ou data URL) em src de <img>. */
export function normalizeQrImageSrc(qr: string | null | undefined): string | null {
  if (!qr) return null;
  const trimmed = qr.trim();
  if (trimmed.startsWith('data:image')) return trimmed;
  if (trimmed.length > 80 && /^[A-Za-z0-9+/=]+$/.test(trimmed.replace(/\s/g, ''))) {
    return `data:image/png;base64,${trimmed}`;
  }
  return null;
}

export function formatWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return phone;
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return `+${digits}`;
}

export function formatInstanceDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso;
  }
}
