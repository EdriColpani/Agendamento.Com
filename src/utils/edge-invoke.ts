import { supabase, supabaseAnonKey, supabaseUrl } from '@/integrations/supabase/client';
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

type InvokePublicOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

export async function invokeEdgeWithAuth(
  functionName: string,
  options: InvokeWithAuthOptions = {},
): Promise<InvokeResponse> {
  const preparedBody =
    options.body === undefined || options.body instanceof FormData || typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);

  const isFormData = preparedBody instanceof FormData;
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/functions/v1/${encodeURIComponent(functionName)}`;

  const requestEdge = async (token: string): Promise<{ res?: Response; networkError?: string }> => {
    const headers: Record<string, string> = {
      ...(options.headers || {}),
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    };

    if (!isFormData && preparedBody !== undefined && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: preparedBody === undefined ? undefined : (isFormData ? preparedBody : (preparedBody as string)),
        headers,
      });
      return { res };
    } catch (e) {
      return { networkError: e instanceof Error ? e.message : String(e) };
    }
  };

  const parseResponse = async (res: Response): Promise<InvokeResponse> => {
    const rawText = await res.text();
    let data: unknown = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText) as unknown;
      } catch {
        data = { error: rawText };
      }
    }

    if (!res.ok) {
      return {
        data,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: { data: data ?? rawText },
        },
      };
    }

    return { data, error: undefined };
  };

  try {
    let token = await requireCurrentAccessToken();
    let { res, networkError } = await requestEdge(token);

    if (networkError) {
      return {
        data: undefined,
        error: { message: networkError },
      };
    }

    if (!res) {
      return {
        data: undefined,
        error: { message: 'Falha de rede ao chamar Edge Function.' },
      };
    }

    // Token local pode estar inválido no servidor (revogado/expirado): tenta refresh e 1 retry.
    if (res.status === 401) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedToken = refreshData.session?.access_token;
      if (!refreshError && refreshedToken) {
        token = refreshedToken;
        const retry = await requestEdge(token);
        if (retry.networkError) {
          return {
            data: undefined,
            error: { message: retry.networkError },
          };
        }
        if (!retry.res) {
          return {
            data: undefined,
            error: { message: 'Falha de rede ao chamar Edge Function.' },
          };
        }
        return parseResponse(retry.res);
      }
    }

    return parseResponse(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      data: undefined,
      error: { message: msg },
    };
  }
}

export async function invokeEdgePublic(
  functionName: string,
  options: InvokePublicOptions = {},
): Promise<InvokeResponse> {
  const preparedBody =
    options.body === undefined || options.body instanceof FormData || typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);

  const isFormData = preparedBody instanceof FormData;
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/functions/v1/${encodeURIComponent(functionName)}`;

  const headers: Record<string, string> = {
    ...(options.headers || {}),
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };

  if (!isFormData && preparedBody !== undefined && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: preparedBody === undefined ? undefined : (isFormData ? preparedBody : (preparedBody as string)),
      headers,
    });

    const rawText = await res.text();
    let data: unknown = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText) as unknown;
      } catch {
        data = { error: rawText };
      }
    }

    if (!res.ok) {
      return {
        data,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: { data: rawText || data },
        },
      };
    }

    return { data, error: undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      data: undefined,
      error: { message: msg },
    };
  }
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

export async function invokeEdgePublicOrThrow<T = unknown>(
  functionName: string,
  options: InvokePublicOptions = {},
): Promise<T> {
  const response = await invokeEdgePublic(functionName, options);
  if (response.error || extractDataError(response.data)) {
    throw new Error(parseEdgeInvokeError(response));
  }
  return response.data as T;
}

