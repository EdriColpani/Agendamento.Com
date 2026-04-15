import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function getEncryptionKey(): Promise<Uint8Array | null> {
  const raw = Deno.env.get("COMPANY_PAYMENT_CREDENTIALS_ENCRYPTION_KEY")?.trim();
  if (!raw) return null;
  try {
    const keyBytes = base64ToBytes(raw);
    if (keyBytes.length !== 32) return null;
    return keyBytes;
  } catch {
    return null;
  }
}

async function encryptCredentialsJson(
  obj: Record<string, unknown>,
  rawKey: Uint8Array,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(obj)),
  );
  const ct = new Uint8Array(ciphertext);
  const envelope = {
    v: 1,
    iv: bytesToBase64(iv),
    d: bytesToBase64(ct),
  };
  return JSON.stringify(envelope);
}

async function validateMercadoPagoToken(accessToken: string): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const res = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      message: text ? `Mercado Pago (${res.status}): ${text.slice(0, 200)}` : `Mercado Pago retornou ${res.status}`,
    };
  }
  try {
    const body = await res.json() as { id?: number | string };
    const userId = body?.id != null ? String(body.id) : "";
    if (!userId) return { ok: false, message: "Resposta inválida do Mercado Pago (sem id)." };
    return { ok: true, userId };
  } catch {
    return { ok: false, message: "Resposta inválida do Mercado Pago." };
  }
}

async function assertProprietarioOrAdmin(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data: userCompany, error: userCompanyError } = await supabaseAdmin
    .from("user_companies")
    .select("role_type")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (userCompanyError) {
    return {
      ok: false,
      status: 403,
      message: "Erro ao validar permissões para a empresa.",
    };
  }
  if (!userCompany?.role_type) {
    return { ok: false, status: 403, message: "Você não tem vínculo com esta empresa." };
  }

  const { data: roleTypeData, error: roleTypeError } = await supabaseAdmin
    .from("role_types")
    .select("description")
    .eq("id", userCompany.role_type)
    .maybeSingle();

  if (roleTypeError || !roleTypeData?.description) {
    return { ok: false, status: 403, message: "Não foi possível verificar seu papel na empresa." };
  }

  const roleDescription = roleTypeData.description.trim().toLowerCase();
  const normalized = roleDescription.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const allowed = ["proprietário", "admin", "proprietario"].map((a) =>
    a.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  if (!allowed.includes(normalized)) {
    return {
      ok: false,
      status: 403,
      message: 'Apenas "Proprietário" ou "Admin" da empresa podem configurar pagamentos.',
    };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Ambiente Supabase incompleto na função." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized: No Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido no corpo." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = typeof body.action === "string" ? body.action : "upsert";
  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";

  if (!companyId) {
    return new Response(JSON.stringify({ error: "company_id é obrigatório." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const perm = await assertProprietarioOrAdmin(supabaseAdmin, user.id, companyId);
  if (!perm.ok) {
    return new Response(JSON.stringify({ error: perm.message }), {
      status: perm.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "status") {
    const { data, error } = await supabaseAdmin
      .from("company_payment_credentials")
      .select("provider, is_active, last_validated_at, validation_error, provider_account_id, updated_at")
      .eq("company_id", companyId);

    if (error) {
      console.error("[upsert-company-payment-credentials] status select:", error);
      return new Response(JSON.stringify({ error: "Erro ao consultar status." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action !== "upsert") {
    return new Response(JSON.stringify({ error: "action inválida. Use upsert ou status." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  if (provider !== "mercadopago") {
    return new Response(JSON.stringify({ error: 'provider deve ser "mercadopago".' }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const creds = body.credentials;
  const accessToken =
    creds && typeof creds === "object" && creds !== null && "access_token" in creds &&
      typeof (creds as { access_token?: unknown }).access_token === "string"
      ? (creds as { access_token: string }).access_token.trim()
      : "";

  if (!accessToken) {
    return new Response(JSON.stringify({ error: "credentials.access_token é obrigatório." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const encKey = await getEncryptionKey();
  if (!encKey) {
    return new Response(
      JSON.stringify({
        error:
          "Chave de cifrado não configurada no servidor (COMPANY_PAYMENT_CREDENTIALS_ENCRYPTION_KEY, base64 de 32 bytes).",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const mp = await validateMercadoPagoToken(accessToken);
  if (!mp.ok) {
    return new Response(JSON.stringify({ error: mp.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const encrypted_payload = await encryptCredentialsJson(
    { access_token: accessToken },
    encKey,
  );

  const row = {
    company_id: companyId,
    provider,
    encrypted_payload,
    provider_account_id: mp.userId,
    is_active: true,
    validation_error: null as string | null,
    last_validated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabaseAdmin
    .from("company_payment_credentials")
    .upsert(row, { onConflict: "company_id,provider" });

  if (upsertError) {
    console.error("[upsert-company-payment-credentials] upsert:", upsertError);
    return new Response(JSON.stringify({ error: "Erro ao gravar credenciais." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      provider,
      is_active: true,
      provider_account_id: mp.userId,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
