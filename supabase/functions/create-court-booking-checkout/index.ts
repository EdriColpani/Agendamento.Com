import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const BRAND_SITE_URL = "https://www.planoagenda.com.br";

/** Decifra payload de `company_payment_credentials` (mesmo envelope da Edge upsert-company-payment-credentials). */
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
    const text = new TextDecoder().decode(plain);
    return JSON.parse(text) as Record<string, unknown>;
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

function courtExternalReference(appointmentId: string): string {
  return `courtbook:${appointmentId}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const SITE_URL = Deno.env.get("SITE_URL") ?? BRAND_SITE_URL;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const master = getCompanyPaymentMasterKey();
  if (!master) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 503);
  }

  let body: { appointment_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const appointmentId = typeof body.appointment_id === "string" ? body.appointment_id.trim() : "";
  if (!appointmentId) {
    return jsonResponse({ error: "appointment_id é obrigatório." }, 400);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: appt, error: apptErr } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, total_price, payment_method, status, booking_kind, created_at, court_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptErr || !appt) {
    return jsonResponse({ error: "Agendamento não encontrado." }, 404);
  }

  if (appt.booking_kind !== "court" || appt.payment_method !== "mercado_pago") {
    return jsonResponse({ error: "Este agendamento não está configurado para pagamento online Mercado Pago." }, 400);
  }

  if (appt.status !== "pendente") {
    return jsonResponse({ error: "Apenas reservas pendentes podem abrir checkout." }, 400);
  }

  const createdMs = new Date(String(appt.created_at)).getTime();
  if (Number.isNaN(createdMs) || Date.now() - createdMs > 3 * 60 * 60 * 1000) {
    return jsonResponse({ error: "Prazo para pagamento online desta reserva expirou. Refaça a reserva." }, 400);
  }

  const total = Number(appt.total_price);
  if (Number.isNaN(total) || total < 0.5) {
    return jsonResponse({ error: "Valor da reserva abaixo do mínimo do Mercado Pago (R$ 0,50) ou inválido." }, 400);
  }

  const { data: cred, error: credErr } = await supabaseAdmin
    .from("company_payment_credentials")
    .select("encrypted_payload")
    .eq("company_id", appt.company_id)
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
  if (appt.court_id) {
    const { data: court } = await supabaseAdmin.from("courts").select("name").eq("id", appt.court_id).maybeSingle();
    if (court?.name) courtLabel = String(court.name);
  }

  const rounded = Math.round(total * 100) / 100;
  const extRef = courtExternalReference(appointmentId);
  const q = (mp: string) =>
    `${SITE_URL}/agendamento-confirmado/${appointmentId}?flow=court&mp=${mp}&paymentMethod=mercado_pago`;
  const successUrl = q("1");
  const failUrl = q("0");
  const pendingUrl = successUrl;

  const preferenceBody = {
    items: [
      {
        title: `Reserva: ${courtLabel}`,
        description: `Reserva de quadra — ${appointmentId.slice(0, 8)}…`,
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
      msg = errJson.message || errJson.error || msg;
    } catch {
      /* ignore */
    }
    console.error("[create-court-booking-checkout] MP error:", msg);
    return jsonResponse({ error: "Falha ao criar checkout no Mercado Pago." }, 502);
  }

  const mpData = await mpRes.json() as { id?: string; init_point?: string; sandbox_init_point?: string };
  const prefId = mpData.id;
  const initPoint = mpData.init_point || mpData.sandbox_init_point;
  if (!prefId || !initPoint) {
    return jsonResponse({ error: "Resposta inválida do Mercado Pago." }, 502);
  }

  const { error: updErr } = await supabaseAdmin
    .from("appointments")
    .update({
      mp_preference_id: prefId,
      mp_payment_status: "checkout_created",
    })
    .eq("id", appointmentId)
    .eq("status", "pendente");

  if (updErr) {
    console.error("[create-court-booking-checkout] update appointment:", updErr);
    return jsonResponse({ error: "Erro ao registrar preferência na reserva." }, 500);
  }

  return jsonResponse({
    preference_id: prefId,
    init_point: initPoint,
  }, 200);
});
