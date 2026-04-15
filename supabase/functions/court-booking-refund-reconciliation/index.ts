import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const startedAt = new Date();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env vars ausentes." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const master = getCompanyPaymentMasterKey();
  if (!master) {
    return new Response(JSON.stringify({ error: "COMPANY_PAYMENT_CREDENTIALS_ENCRYPTION_KEY ausente/inválida." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { limit?: number; max_retries?: number } = {};
  try {
    body = await req.json();
  } catch {
    // opcional
  }

  const limitRaw = Number(body.limit ?? Deno.env.get("COURT_REFUND_RECONCILIATION_LIMIT") ?? "120");
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), 300) : 120;
  const retriesRaw = Number(body.max_retries ?? Deno.env.get("COURT_REFUND_RECONCILIATION_MAX_RETRIES") ?? "3");
  const maxRetries = Number.isFinite(retriesRaw) && retriesRaw >= 1 ? Math.min(Math.floor(retriesRaw), 8) : 3;
  const alertThresholdRaw = Number(Deno.env.get("COURT_REFUND_RECONCILIATION_ALERT_THRESHOLD") ?? "15");
  const alertThreshold = Number.isFinite(alertThresholdRaw) && alertThresholdRaw >= 1 ? Math.floor(alertThresholdRaw) : 15;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let runLogId: string | null = null;
  const { data: runRow } = await supabaseAdmin
    .from("court_booking_refund_reconciliation_runs")
    .insert({
      status: "running",
      scan_limit: limit,
      retries_limit: maxRetries,
      started_at: startedAt.toISOString(),
      triggered_by: "cron",
    })
    .select("id")
    .maybeSingle();
  if (runRow?.id) runLogId = String(runRow.id);

  const finishRunLog = async (patch: Record<string, unknown>) => {
    if (!runLogId) return;
    const finishedAt = new Date();
    await supabaseAdmin
      .from("court_booking_refund_reconciliation_runs")
      .update({
        ...patch,
        finished_at: finishedAt.toISOString(),
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      })
      .eq("id", runLogId);
  };

  const { data: rows, error: scanErr } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, mp_payment_id, mp_payment_status")
    .eq("booking_kind", "court")
    .eq("payment_method", "mercado_pago")
    .eq("status", "cancelado")
    .in("mp_payment_status", ["refund_pending_manual", "refund_in_progress"])
    .not("mp_payment_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (scanErr) {
    await finishRunLog({ status: "error", error_message: scanErr.message, scanned_count: 0 });
    return new Response(JSON.stringify({ error: scanErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets = rows ?? [];
  let refundSuccessCount = 0;
  let manualRequiredCount = 0;
  let errorsCount = 0;
  const reconciledIds: string[] = [];

  for (const row of targets) {
    const appointmentId = String(row.id);
    const companyId = String(row.company_id);
    const paymentId = String(row.mp_payment_id ?? "");
    if (!paymentId) continue;

    try {
      const { data: cred } = await supabaseAdmin
        .from("company_payment_credentials")
        .select("encrypted_payload, is_active")
        .eq("company_id", companyId)
        .eq("provider", "mercadopago")
        .eq("is_active", true)
        .maybeSingle();

      if (!cred?.encrypted_payload) {
        manualRequiredCount++;
        continue;
      }

      const plain = await decryptCredentialsPayload(String(cred.encrypted_payload), master);
      const accessToken = typeof plain?.access_token === "string" ? plain.access_token.trim() : "";
      if (!accessToken) {
        manualRequiredCount++;
        continue;
      }

      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!paymentRes.ok) {
        errorsCount++;
        continue;
      }

      const payment = await paymentRes.json() as { status?: string; status_detail?: string; payment_type_id?: string; payment_method_id?: string };
      const paymentStatus = String(payment.status ?? "").trim().toLowerCase();
      const statusDetail = String(payment.status_detail ?? "").trim().toLowerCase();
      const alreadyRefunded = paymentStatus === "refunded" || paymentStatus === "charged_back" || statusDetail.includes("refunded");

      if (alreadyRefunded) {
        await supabaseAdmin
          .from("appointments")
          .update({ mp_payment_status: "refund_approved" })
          .eq("id", appointmentId);
        await supabaseAdmin.from("court_booking_refund_attempts").insert({
          company_id: companyId,
          appointment_id: appointmentId,
          mp_payment_id: paymentId,
          payment_type_id: payment.payment_type_id ?? null,
          payment_method_id: payment.payment_method_id ?? null,
          status: "success",
          mp_refund_status: "already_refunded",
          attempted_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        });
        refundSuccessCount++;
        reconciledIds.push(appointmentId);
        continue;
      }

      if (paymentStatus !== "approved") {
        manualRequiredCount++;
        continue;
      }

      const { count: attemptsCount } = await supabaseAdmin
        .from("court_booking_refund_attempts")
        .select("id", { count: "exact", head: true })
        .eq("appointment_id", appointmentId)
        .neq("status", "success");
      const retriesUsed = Number(attemptsCount ?? 0);
      if (retriesUsed >= maxRetries) {
        manualRequiredCount++;
        continue;
      }

      const idemKey = crypto.randomUUID();
      const refundRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idemKey,
        },
        body: JSON.stringify({}),
      });

      if (!refundRes.ok) {
        const errText = await refundRes.text().catch(() => "");
        await supabaseAdmin.from("court_booking_refund_attempts").insert({
          company_id: companyId,
          appointment_id: appointmentId,
          mp_payment_id: paymentId,
          payment_type_id: payment.payment_type_id ?? null,
          payment_method_id: payment.payment_method_id ?? null,
          request_idempotency_key: idemKey,
          status: "error",
          error_message: errText ? errText.slice(0, 400) : `MP refund ${refundRes.status}`,
          attempted_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        });
        errorsCount++;
        continue;
      }

      const refundBody = await refundRes.json() as { id?: number | string; status?: string };
      const refundStatus = String(refundBody.status ?? "approved");
      await supabaseAdmin
        .from("appointments")
        .update({ mp_payment_status: refundStatus.toLowerCase() === "approved" ? "refund_approved" : "refund_in_progress" })
        .eq("id", appointmentId);
      await supabaseAdmin.from("court_booking_refund_attempts").insert({
        company_id: companyId,
        appointment_id: appointmentId,
        mp_payment_id: paymentId,
        payment_type_id: payment.payment_type_id ?? null,
        payment_method_id: payment.payment_method_id ?? null,
        request_idempotency_key: idemKey,
        status: "success",
        mp_refund_id: refundBody.id != null ? String(refundBody.id) : null,
        mp_refund_status: refundStatus,
        attempted_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      });
      refundSuccessCount++;
      reconciledIds.push(appointmentId);
    } catch (error) {
      console.error("[court-booking-refund-reconciliation] item error:", appointmentId, error);
      errorsCount++;
    }
  }

  const warningMessage =
    manualRequiredCount >= alertThreshold
      ? `ALERTA: ${manualRequiredCount} reservas continuam com necessidade manual de estorno.`
      : null;
  if (warningMessage) {
    console.warn("[court-booking-refund-reconciliation]", warningMessage);
  }

  await finishRunLog({
    status: "success",
    scanned_count: targets.length,
    refund_success_count: refundSuccessCount,
    manual_required_count: manualRequiredCount,
    errors_count: errorsCount,
    warning_message: warningMessage,
    reconciled_appointment_ids: reconciledIds.slice(0, 80),
  });

  return new Response(
    JSON.stringify({
      ok: true,
      scanned: targets.length,
      refund_success_count: refundSuccessCount,
      manual_required_count: manualRequiredCount,
      errors_count: errorsCount,
      alert_threshold: alertThreshold,
      warning_message: warningMessage,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
