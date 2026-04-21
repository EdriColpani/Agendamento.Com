import { supabase } from '@/integrations/supabase/client';
import { requireCurrentAccessToken } from '@/utils/edge-auth';

type InvokeResponse = {
  data?: unknown;
  error?: {
    message?: string;
    context?: {
      data?: unknown;
    };
  };
};

function extractDataError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const maybe = data as { error?: unknown };
  return typeof maybe.error === 'string' ? maybe.error : null;
}

export function parseEdgeInvokeError(response: InvokeResponse): string {
  const contextData = response.error?.context?.data;

  if (contextData && typeof contextData === 'object' && 'error' in (contextData as Record<string, unknown>)) {
    const nested = (contextData as { error?: unknown }).error;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }

  if (typeof contextData === 'string' && contextData.trim()) {
    try {
      const parsed = JSON.parse(contextData) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
      return contextData;
    } catch {
      return contextData;
    }
  }

  const dataError = extractDataError(response.data);
  if (dataError) return dataError;

  if (response.error?.message && response.error.message.trim()) {
    return response.error.message;
  }

  return 'Erro desconhecido na chamada da Edge Function.';
}

type InvokeWithAuthOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

export async function invokeEdgeWithAuth(
  functionName: string,
  options: InvokeWithAuthOptions = {},
): Promise<InvokeResponse> {
  const token = await requireCurrentAccessToken();

  const preparedBody =
    options.body === undefined || options.body instanceof FormData || typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);

  const isJsonBody = preparedBody !== undefined && !(preparedBody instanceof FormData);

  return supabase.functions.invoke(functionName, {
    body: preparedBody as string | FormData | undefined,
    headers: {
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  }) as Promise<InvokeResponse>;
}

export async function invokeEdgeWithAuthOrThrow<T = unknown>(
  functionName: string,
  options: InvokeWithAuthOptions = {},
): Promise<T> {
  const response = await invokeEdgeWithAuth(functionName, options);
  if (response.error || extractDataError(response.data)) {
    throw new Error(parseEdgeInvokeError(response));
  }
  return response.data as T;
}

