import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const BRAND_SITE_URL = "https://www.planoagenda.com.br";

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function getCompanyPaymentMasterKey(): Uint8Array | null {
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

async function decryptCredentialsPayload(
  envelopeStr: string,
  rawKey: Uint8Array,
): Promise<Record<string, unknown> | null> {
  let envelope: { v?: number; iv?: string; d?: string };
  try {
    envelope = JSON.parse(envelopeStr) as { v?: number; iv?: string; d?: string };
  } catch {
    return null;
  }
  if (envelope.v !== 1 || !envelope.iv || !envelope.d) return null;

  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.d);
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function packageExternalReference(packageId: string): string {
  return `courtpackage:${packageId}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const SITE_URL = Deno.env.get("SITE_URL") ?? BRAND_SITE_URL;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !authData?.user) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  let body: { package_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const packageId = typeof body.package_id === "string" ? body.package_id.trim() : "";
  if (!packageId) {
    return jsonResponse({ error: "package_id é obrigatório." }, 400);
  }

  const { data: pkg, error: pkgErr } = await supabaseAdmin
    .from("court_monthly_packages")
    .select("id, company_id, total_amount, payment_method, status, payment_status, court_id")
    .eq("id", packageId)
    .maybeSingle();

  if (pkgErr || !pkg) {
    return jsonResponse({ error: "Pacote mensal não encontrado." }, 404);
  }

  const { data: perm } = await supabaseAdmin
    .from("user_companies")
    .select("role_types(description)")
    .eq("company_id", pkg.company_id)
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();
  const roleDescription = String((perm as { role_types?: { description?: string } } | null)?.role_types?.description || "");
  if (roleDescription !== "Proprietário" && roleDescription !== "Admin") {
    return jsonResponse({ error: "Sem permissão para gerar checkout deste pacote." }, 403);
  }

  if (pkg.payment_method !== "mercado_pago") {
    return jsonResponse({ error: "Este pacote não está configurado para pagamento online." }, 400);
  }

  if (pkg.status !== "pending_payment") {
    return jsonResponse({ error: "Apenas pacotes pendentes podem abrir checkout." }, 400);
  }

  const total = Number(pkg.total_amount);
  if (Number.isNaN(total) || total < 0.5) {
    return jsonResponse({ error: "Valor do pacote abaixo do mínimo do Mercado Pago (R$ 0,50) ou inválido." }, 400);
  }

  const master = getCompanyPaymentMasterKey();
  if (!master) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 503);
  }

  const { data: cred, error: credErr } = await supabaseAdmin
    .from("company_payment_credentials")
    .select("encrypted_payload")
    .eq("company_id", pkg.company_id)
    .eq("provider", "mercadopago")
    .eq("is_active", true)
    .maybeSingle();

  if (credErr || !cred?.encrypted_payload) {
    return jsonResponse({ error: "A empresa ainda não configurou o Mercado Pago para recebimentos online." }, 400);
  }

  const plain = await decryptCredentialsPayload(cred.encrypted_payload, master);
  const accessToken = plain?.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return jsonResponse({ error: "Credencial Mercado Pago inválida no servidor." }, 500);
  }

  let courtLabel = "Quadra";
  if (pkg.court_id) {
    const { data: court } = await supabaseAdmin.from("courts").select("name").eq("id", pkg.court_id).maybeSingle();
    if (court?.name) courtLabel = String(court.name);
  }

  const rounded = Math.round(total * 100) / 100;
  const extRef = packageExternalReference(packageId);
  const q = (mp: string) =>
    `${SITE_URL}/?flow=court-package&package=${packageId}&mp=${mp}&paymentMethod=mercado_pago`;
  const successUrl = q("1");
  const failUrl = q("0");
  const pendingUrl = successUrl;

  const preferenceBody = {
    items: [
      {
        title: `Pacote mensal: ${courtLabel}`,
        description: `Pacote mensal de quadra — ${packageId.slice(0, 8)}…`,
        quantity: 1,
        unit_price: rounded,
        currency_id: "BRL",
      },
    ],
    external_reference: extRef,
    back_urls: {
      success: successUrl,
      failure: failUrl,
      pending: pendingUrl,
    },
    auto_return: "approved",
    notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
    binary_mode: true,
  };

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken.trim()}`,
    },
    body: JSON.stringify(preferenceBody),
  });

  if (!mpRes.ok) {
    let msg = `Mercado Pago preferences ${mpRes.status}`;
    try {
      const errJson = await mpRes.json();
      msg = (errJson as { message?: string; error?: string }).message || (errJson as { message?: string; error?: string }).error || msg;
    } catch {
      // ignore
    }
    console.error("[create-court-monthly-package-checkout] MP error:", msg);
    return jsonResponse({ error: "Falha ao criar checkout no Mercado Pago." }, 502);
  }

  const mpData = await mpRes.json() as { id?: string; init_point?: string; sandbox_init_point?: string };
  const prefId = mpData.id;
  const initPoint = mpData.init_point || mpData.sandbox_init_point;
  if (!prefId || !initPoint) {
    return jsonResponse({ error: "Resposta inválida do Mercado Pago." }, 502);
  }

  const { error: updErr } = await supabaseAdmin
    .from("court_monthly_packages")
    .update({
      mp_preference_id: prefId,
      mp_payment_status: "checkout_created",
    })
    .eq("id", packageId)
    .eq("status", "pending_payment");

  if (updErr) {
    console.error("[create-court-monthly-package-checkout] update package:", updErr);
    return jsonResponse({ error: "Erro ao registrar preferência no pacote." }, 500);
  }

  return jsonResponse({
    preference_id: prefId,
    init_point: initPoint,
  }, 200);
});
