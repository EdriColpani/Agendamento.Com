import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TimeoutRunStatus = "running" | "success" | "error";

serve(async (req) => {
  const startedAt = new Date();

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
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env vars ausentes." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Segurança: só aceitar chamadas internas com service role.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { timeout_minutes?: number; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }

  const timeoutMinutesRaw = Number(
    body.timeout_minutes ?? Deno.env.get("COURT_BOOKING_PAYMENT_TIMEOUT_MINUTES") ?? "30",
  );
  const timeoutMinutes = Number.isFinite(timeoutMinutesRaw) && timeoutMinutesRaw >= 5
    ? Math.floor(timeoutMinutesRaw)
    : 30;

  const limitRaw = Number(body.limit ?? Deno.env.get("COURT_BOOKING_PAYMENT_TIMEOUT_LIMIT") ?? "200");
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1
    ? Math.min(Math.floor(limitRaw), 500)
    : 200;

  const cutoffIso = new Date(Date.now() - timeoutMinutes * 60_000).toISOString();

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const alertThresholdRaw = Number(
    Deno.env.get("COURT_BOOKING_PAYMENT_TIMEOUT_ALERT_THRESHOLD") ?? "20",
  );
  const alertThreshold = Number.isFinite(alertThresholdRaw) && alertThresholdRaw >= 1
    ? Math.floor(alertThresholdRaw)
    : 20;

  let runLogId: string | null = null;
  const createRunLog = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("court_booking_payment_timeout_runs")
        .insert({
          status: "running",
          timeout_minutes: timeoutMinutes,
          scan_limit: limit,
          started_at: startedAt.toISOString(),
          triggered_by: "cron",
        })
        .select("id")
        .single();
      if (!error && data?.id) runLogId = data.id;
    } catch (error) {
      console.warn("[court-booking-payment-timeout-scheduler] run log insert failed:", error);
    }
  };

  const finishRunLog = async (params: {
    status: TimeoutRunStatus;
    foundCount?: number;
    cancelledCount?: number;
    errorMessage?: string;
    cancelledIds?: string[];
  }) => {
    if (!runLogId) return;
    try {
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      const { error } = await supabaseAdmin
        .from("court_booking_payment_timeout_runs")
        .update({
          status: params.status,
          finished_at: finishedAt.toISOString(),
          duration_ms: durationMs,
          found_count: params.foundCount ?? 0,
          cancelled_count: params.cancelledCount ?? 0,
          error_message: params.errorMessage ?? null,
          cancelled_ids_sample: params.cancelledIds ?? [],
        })
        .eq("id", runLogId);
      if (error) {
        console.warn("[court-booking-payment-timeout-scheduler] run log update failed:", error);
      }
    } catch (error) {
      console.warn("[court-booking-payment-timeout-scheduler] run log finish failed:", error);
    }
  };

  await createRunLog();

  const { data: staleRows, error: staleErr } = await supabaseAdmin
    .from("appointments")
    .select("id")
    .eq("booking_kind", "court")
    .eq("payment_method", "mercado_pago")
    .eq("status", "pendente")
    .is("mp_payment_id", null)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (staleErr) {
    console.error("[court-booking-payment-timeout-scheduler] select stale:", staleErr);
    await finishRunLog({
      status: "error",
      errorMessage: staleErr.message,
    });
    return new Response(JSON.stringify({ error: staleErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = (staleRows ?? []).map((r) => r.id);
  if (!ids.length) {
    await finishRunLog({
      status: "success",
      foundCount: 0,
      cancelledCount: 0,
      cancelledIds: [],
    });
    return new Response(JSON.stringify({
      ok: true,
      timeout_minutes: timeoutMinutes,
      limit,
      processed: 0,
      message: "Nenhuma reserva pendente expirada encontrada.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: updErr } = await supabaseAdmin
    .from("appointments")
    .update({
      status: "cancelado",
      mp_payment_status: "payment_timeout_cancelled",
      cancellation_reason: "Timeout automático por ausência de pagamento.",
      cancelled_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("status", "pendente")
    .is("mp_payment_id", null);

  if (updErr) {
    console.error("[court-booking-payment-timeout-scheduler] update stale:", updErr);
    await finishRunLog({
      status: "error",
      foundCount: ids.length,
      cancelledCount: 0,
      errorMessage: updErr.message,
      cancelledIds: ids.slice(0, 20),
    });
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (ids.length >= alertThreshold) {
    console.warn(
      `[court-booking-payment-timeout-scheduler] ALERT: ${ids.length} reservas canceladas por timeout em uma execução.`,
      {
        timeout_minutes: timeoutMinutes,
        limit,
        alert_threshold: alertThreshold,
      },
    );
  }

  await finishRunLog({
    status: "success",
    foundCount: ids.length,
    cancelledCount: ids.length,
    cancelledIds: ids.slice(0, 50),
  });

  return new Response(JSON.stringify({
    ok: true,
    timeout_minutes: timeoutMinutes,
    limit,
    processed: ids.length,
    alert_threshold: alertThreshold,
    cancelled_ids: ids,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
