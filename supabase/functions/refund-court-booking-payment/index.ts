import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

type RefundRequestBody = {
  appointment_id?: string;
  company_id?: string;
  client_id?: string;
  client_nickname?: string | null;
  observations?: string | null;
  cancellation_reason?: string | null;
};

type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  payment_type_id?: string;
  payment_method_id?: string;
};

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
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    const text = new TextDecoder().decode(plain);
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeRole(input: string): string {
  return input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function safeText(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function buildObservations(existing: string | null, cancellationReason: string | null): string | null {
  const base = (existing ?? "").trim();
  const now = new Date().toISOString();
  const reasonPart = cancellationReason ? ` | motivo: ${cancellationReason}` : "";
  const marker = `[cancelamento_arena_estorno] ${now}${reasonPart}`;
  if (!base) return marker;
  return `${base}\n${marker}`.slice(0, 500);
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

  if (userCompanyError || !userCompany?.role_type) {
    return { ok: false, status: 403, message: "Usuário sem vínculo permitido para esta empresa." };
  }

  const { data: roleTypeData, error: roleTypeError } = await supabaseAdmin
    .from("role_types")
    .select("description")
    .eq("id", userCompany.role_type)
    .maybeSingle();

  if (roleTypeError || !roleTypeData?.description) {
    return { ok: false, status: 403, message: "Não foi possível validar o papel do usuário." };
  }

  const normalized = normalizeRole(roleTypeData.description);
  if (normalized !== "proprietario" && normalized !== "admin") {
    return { ok: false, status: 403, message: "Apenas Proprietário/Admin pode cancelar e estornar." };
  }

  return { ok: true };
}

async function getSellerAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  master: Uint8Array,
): Promise<string | null> {
  const { data: cred, error: credErr } = await supabaseAdmin
    .from("company_payment_credentials")
    .select("encrypted_payload, is_active")
    .eq("company_id", companyId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  if (credErr || !cred || !cred.is_active || !cred.encrypted_payload) {
    return null;
  }

  const decrypted = await decryptCredentialsPayload(String(cred.encrypted_payload), master);
  const token = decrypted?.access_token;
  if (typeof token !== "string" || !token.trim()) return null;
  return token.trim();
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const master = getCompanyPaymentMasterKey();
  if (!master) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 503);
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  let body: RefundRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido no corpo." }, 400);
  }

  const appointmentId = typeof body.appointment_id === "string" ? body.appointment_id.trim() : "";
  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  const clientNickname = safeText(body.client_nickname, 200);
  const observationsInput = safeText(body.observations, 500);
  const cancellationReason = safeText(body.cancellation_reason, 250);

  if (!appointmentId || !companyId || !clientId) {
    return jsonResponse({ error: "appointment_id, company_id e client_id são obrigatórios." }, 400);
  }

  const perm = await assertProprietarioOrAdmin(supabaseAdmin, authData.user.id, companyId);
  if (!perm.ok) {
    return jsonResponse({ error: perm.message }, perm.status);
  }

  const { data: appointment, error: appointmentError } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, booking_kind, status, payment_method, mp_payment_id, mp_payment_status, observations")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return jsonResponse({ error: "Reserva não encontrada." }, 404);
  }
  if (appointment.company_id !== companyId || appointment.booking_kind !== "court") {
    return jsonResponse({ error: "Reserva fora do módulo de quadras desta empresa." }, 403);
  }
  if (appointment.status === "concluido") {
    return jsonResponse({ error: "Não é permitido cancelar reserva concluída." }, 409);
  }
  if (appointment.payment_method !== "mercado_pago" || !appointment.mp_payment_id) {
    return jsonResponse({ error: "Reserva sem pagamento online elegível para estorno automático." }, 409);
  }

  const accessToken = await getSellerAccessToken(supabaseAdmin, companyId, master);
  if (!accessToken) {
    return jsonResponse({ error: "Credencial Mercado Pago da empresa não está válida/ativa." }, 409);
  }

  const idempotencyKey = crypto.randomUUID();
  const paymentId = String(appointment.mp_payment_id);
  let attemptId: string | null = null;
  let paymentTypeId: string | null = null;
  let paymentMethodId: string | null = null;

  const { data: attemptInsert } = await supabaseAdmin
    .from("court_booking_refund_attempts")
    .insert({
      company_id: companyId,
      appointment_id: appointmentId,
      mp_payment_id: paymentId,
      request_idempotency_key: idempotencyKey,
      status: "pending",
      requested_by_user_id: authData.user.id,
    })
    .select("id")
    .maybeSingle();
  if (attemptInsert?.id) attemptId = String(attemptInsert.id);

  const finishAttempt = async (patch: Record<string, unknown>) => {
    if (!attemptId) return;
    await supabaseAdmin.from("court_booking_refund_attempts").update(patch).eq("id", attemptId);
  };

  const updateAppointmentCancelled = async (mpStatus: string): Promise<string | null> => {
    const nextObservations = buildObservations(observationsInput ?? appointment.observations, cancellationReason);
    const { error } = await supabaseAdmin
      .from("appointments")
      .update({
        client_id: clientId,
        client_nickname: clientNickname,
        observations: nextObservations,
        cancellation_reason: cancellationReason,
        cancelled_at: new Date().toISOString(),
        cancelled_by_user_id: authData.user.id,
        status: "cancelado",
        mp_payment_status: mpStatus,
      })
      .eq("id", appointmentId)
      .eq("company_id", companyId);
    return error ? error.message : null;
  };

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!paymentRes.ok) {
    const text = await paymentRes.text().catch(() => "");
    const mpErr = text ? `Falha ao consultar pagamento no MP (${paymentRes.status}): ${text.slice(0, 300)}` : `Falha ao consultar pagamento no MP (${paymentRes.status}).`;
    const cancelErr = await updateAppointmentCancelled("refund_pending_manual");
    await finishAttempt({ status: "error", error_message: cancelErr ? `${mpErr} | cancel_err: ${cancelErr}` : mpErr, finished_at: new Date().toISOString() });
    return new Response(JSON.stringify({
      ok: true, refund_auto: false, refund_required: true, manual_required: true,
      message: "Reserva cancelada. Não foi possível validar pagamento no MP, reembolso ficou pendente para tratamento manual.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const payment = await paymentRes.json() as MercadoPagoPaymentResponse;
  const paymentStatus = String(payment.status ?? "").trim().toLowerCase();
  const paymentStatusDetail = String(payment.status_detail ?? "").trim().toLowerCase();
  paymentTypeId = payment.payment_type_id ? String(payment.payment_type_id) : null;
  paymentMethodId = payment.payment_method_id ? String(payment.payment_method_id) : null;
  await finishAttempt({ payment_type_id: paymentTypeId, payment_method_id: paymentMethodId });

  const alreadyRefunded = new Set(["refunded", "charged_back", "chargeback"]);
  const pendingStatuses = new Set(["pending", "in_process", "authorized"]);

  if (alreadyRefunded.has(paymentStatus) || paymentStatusDetail.includes("refunded")) {
    const cancelErr = await updateAppointmentCancelled("refund_approved");
    await finishAttempt({ status: "success", mp_refund_status: "already_refunded", finished_at: new Date().toISOString() });
    return new Response(JSON.stringify({
      ok: true, refund_auto: true, refund_required: false, manual_required: false,
      message: cancelErr ? `Reserva marcada como cancelada, mas houve erro local: ${cancelErr}` : "Reserva cancelada e pagamento já estava estornado no Mercado Pago.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (paymentStatus !== "approved" || pendingStatuses.has(paymentStatus)) {
    const cancelErr = await updateAppointmentCancelled("refund_pending_manual");
    await finishAttempt({
      status: "manual_required",
      mp_refund_status: "not_approved_payment_status",
      error_message: `status=${paymentStatus || "unknown"}`,
      finished_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({
      ok: true, refund_auto: false, refund_required: true, manual_required: true, payment_type_id: paymentTypeId, payment_method_id: paymentMethodId,
      message: cancelErr ? `Reserva cancelada com pendência manual, mas houve erro local: ${cancelErr}` : "Reserva cancelada. Pagamento ainda não está aprovado no MP, estorno automático não aplicado.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const refundRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({}),
  });

  if (!refundRes.ok) {
    const text = await refundRes.text().catch(() => "");
    const mpErr = text ? `MP refund erro (${refundRes.status}): ${text.slice(0, 300)}` : `MP refund erro (${refundRes.status}).`;
    const cancelErr = await updateAppointmentCancelled("refund_pending_manual");
    await finishAttempt({ status: "error", error_message: cancelErr ? `${mpErr} | cancel_err: ${cancelErr}` : mpErr, finished_at: new Date().toISOString() });
    return new Response(JSON.stringify({
      ok: true, refund_auto: false, refund_required: true, manual_required: true, payment_type_id: paymentTypeId, payment_method_id: paymentMethodId,
      message: "Reserva cancelada. O estorno automático falhou e foi marcado para tratamento manual.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const refundData = await refundRes.json() as { id?: number | string; status?: string };
  const refundId = refundData?.id != null ? String(refundData.id) : null;
  const refundStatus = refundData?.status != null ? String(refundData.status) : "approved";
  const appointmentMpStatus = refundStatus.trim().toLowerCase() === "approved" ? "refund_approved" : "refund_in_progress";
  const cancelErr = await updateAppointmentCancelled(appointmentMpStatus);

  await finishAttempt({
    status: "success",
    mp_refund_id: refundId,
    mp_refund_status: refundStatus,
    finished_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({
    ok: true, refund_auto: true, refund_required: false, manual_required: false, payment_type_id: paymentTypeId, payment_method_id: paymentMethodId,
    mp_refund_id: refundId, mp_refund_status: refundStatus,
    message: cancelErr ? "Estorno solicitado no MP, mas houve falha ao atualizar alguns dados locais." : "Reserva cancelada e estorno solicitado com sucesso via Mercado Pago.",
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
