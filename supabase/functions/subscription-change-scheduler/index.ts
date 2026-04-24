import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ScheduledChangeRow = {
  id: string;
  company_id: string;
  subscription_id: string;
  to_plan_id: string;
};

type StalePendingRow = {
  id: string;
  payment_attempt_id: string | null;
};

type PaymentAttemptStatusRow = {
  id: string;
  status: string;
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const startedAt = new Date();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  let body: { limit?: number; stale_pending_hours?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }

  const limitRaw = Number(body.limit ?? 100);
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), 500) : 100;
  const stalePendingHoursRaw = Number(body.stale_pending_hours ?? 24);
  const stalePendingHours = Number.isFinite(stalePendingHoursRaw) && stalePendingHoursRaw >= 1
    ? Math.min(Math.floor(stalePendingHoursRaw), 168)
    : 24;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  const staleCutoffIso = new Date(Date.now() - stalePendingHours * 60 * 60 * 1000).toISOString();

  let runLogId: string | null = null;
  const createRunLog = async () => {
    try {
      const { data } = await supabaseAdmin
        .from("subscription_change_scheduler_runs")
        .insert({
          status: "running",
          started_at: startedAt.toISOString(),
        })
        .select("id")
        .single();
      runLogId = data?.id ?? null;
    } catch {
      runLogId = null;
    }
  };

  const finishRunLog = async (params: {
    status: "success" | "error";
    processedCount: number;
    appliedCount: number;
    failedCount: number;
    stalePendingMarkedFailed: number;
    details?: unknown;
    errorMessage?: string;
  }) => {
    if (!runLogId) return;
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    await supabaseAdmin
      .from("subscription_change_scheduler_runs")
      .update({
        status: params.status,
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        processed_count: params.processedCount,
        applied_count: params.appliedCount,
        failed_count: params.failedCount,
        stale_pending_marked_failed: params.stalePendingMarkedFailed,
        details: params.details ?? null,
        error_message: params.errorMessage ?? null,
      })
      .eq("id", runLogId);
  };

  await createRunLog();

  const { data: changesData, error: changesError } = await supabaseAdmin
    .from("subscription_change_requests")
    .select("id, company_id, subscription_id, to_plan_id")
    .eq("change_type", "downgrade")
    .eq("status", "scheduled")
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: true })
    .limit(limit);

  if (changesError) {
    await finishRunLog({
      status: "error",
      processedCount: 0,
      appliedCount: 0,
      failedCount: 0,
      stalePendingMarkedFailed: 0,
      errorMessage: changesError.message,
    });
    return jsonResponse({ error: "Erro interno ao buscar trocas de plano agendadas." }, 500);
  }

  const changes = (changesData ?? []) as ScheduledChangeRow[];
  let applied = 0;
  let stalePendingMarkedFailed = 0;
  const failures: Array<{ change_request_id: string; reason: string }> = [];

  for (const change of changes) {
    try {
      const { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from("company_subscriptions")
        .select("id, status")
        .eq("id", change.subscription_id)
        .maybeSingle();

      if (subscriptionError) throw new Error(subscriptionError.message);
      if (!subscription || subscription.status !== "active") {
        throw new Error("Assinatura não está ativa para receber downgrade.");
      }

      const { error: applySubscriptionError } = await supabaseAdmin
        .from("company_subscriptions")
        .update({
          plan_id: change.to_plan_id,
          next_plan_id: null,
          pending_change_type: null,
        })
        .eq("id", change.subscription_id)
        .eq("status", "active");

      if (applySubscriptionError) throw new Error(applySubscriptionError.message);

      await supabaseAdmin.rpc("sync_company_flags_from_plan", {
        p_company_id: change.company_id,
        p_plan_id: change.to_plan_id,
      });

      const { error: markAppliedError } = await supabaseAdmin
        .from("subscription_change_requests")
        .update({
          status: "applied",
          applied_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", change.id)
        .eq("status", "scheduled");

      if (markAppliedError) throw new Error(markAppliedError.message);
      applied += 1;
    } catch (error: any) {
      const reason = error?.message || "Erro desconhecido ao aplicar downgrade.";
      failures.push({ change_request_id: change.id, reason });
      await supabaseAdmin
        .from("subscription_change_requests")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", change.id)
        .eq("status", "scheduled");
    }
  }

  const { data: stalePendingData, error: stalePendingError } = await supabaseAdmin
    .from("subscription_change_requests")
    .select("id, payment_attempt_id")
    .eq("status", "pending_payment")
    .lt("created_at", staleCutoffIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!stalePendingError) {
    const staleRows = (stalePendingData ?? []) as StalePendingRow[];
    const paymentAttemptIds = staleRows
      .map((row) => row.payment_attempt_id)
      .filter((id): id is string => !!id);

    const attemptsById = new Map<string, string>();
    if (paymentAttemptIds.length > 0) {
      const { data: attemptsData } = await supabaseAdmin
        .from("payment_attempts")
        .select("id, status")
        .in("id", paymentAttemptIds);

      for (const attempt of (attemptsData ?? []) as PaymentAttemptStatusRow[]) {
        attemptsById.set(attempt.id, attempt.status);
      }
    }

    for (const stale of staleRows) {
      const status = stale.payment_attempt_id ? attemptsById.get(stale.payment_attempt_id) : null;
      if (status === "approved") {
        continue;
      }

      const reason = status
        ? `Request marcada como failed por pendência longa (payment_attempt status=${status}).`
        : "Request marcada como failed por pendência longa sem payment_attempt válido.";

      const { error: markStaleError } = await supabaseAdmin
        .from("subscription_change_requests")
        .update({
          status: "failed",
          failure_reason: reason,
        })
        .eq("id", stale.id)
        .eq("status", "pending_payment");

      if (!markStaleError) {
        stalePendingMarkedFailed += 1;
      }
    }
  }

  await finishRunLog({
    status: "success",
    processedCount: changes.length,
    appliedCount: applied,
    failedCount: failures.length,
    stalePendingMarkedFailed,
    details: {
      stale_pending_hours: stalePendingHours,
      failures_sample: failures.slice(0, 20),
    },
  });

  return jsonResponse({
    ok: true,
    processed: changes.length,
    applied,
    failed: failures.length,
    stale_pending_marked_failed: stalePendingMarkedFailed,
    stale_pending_hours: stalePendingHours,
    failures,
  }, 200);
});

