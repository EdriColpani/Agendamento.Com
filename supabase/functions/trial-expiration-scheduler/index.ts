import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ExpiredTrialRow = {
  subscription_id?: string;
  company_id?: string;
  plan_id?: string | null;
  trial_ends_at?: string;
};

type ExpireRpcResult = {
  success?: boolean;
  expired_count?: number;
  expired?: ExpiredTrialRow[];
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

  let body: { limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }

  const limitRaw = Number(body.limit ?? 200);
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1
    ? Math.min(Math.floor(limitRaw), 500)
    : 200;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let runLogId: string | null = null;

  const createRunLog = async () => {
    const { data, error } = await supabaseAdmin
      .from("trial_expiration_scheduler_runs")
      .insert({ status: "running", started_at: startedAt.toISOString() })
      .select("id")
      .single();

    if (error) {
      console.warn("[trial-expiration-scheduler] falha ao criar run log:", error.message);
      return;
    }
    runLogId = data?.id ?? null;
  };

  const finishRunLog = async (params: {
    status: "success" | "error";
    processedCount: number;
    expiredCount: number;
    details?: unknown;
    errorMessage?: string;
  }) => {
    if (!runLogId) return;
    const finishedAt = new Date();
    await supabaseAdmin
      .from("trial_expiration_scheduler_runs")
      .update({
        status: params.status,
        finished_at: finishedAt.toISOString(),
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        processed_count: params.processedCount,
        expired_count: params.expiredCount,
        details: params.details ?? null,
        error_message: params.errorMessage ?? null,
      })
      .eq("id", runLogId);
  };

  try {
    await createRunLog();

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "expire_due_trial_subscriptions",
      { p_limit: limit },
    );

    if (rpcError) {
      console.error("[trial-expiration-scheduler] RPC error:", rpcError.message);
      await finishRunLog({
        status: "error",
        processedCount: 0,
        expiredCount: 0,
        errorMessage: rpcError.message,
      });
      return jsonResponse({ success: false, error: rpcError.message }, 500);
    }

    const result = (rpcData ?? {}) as ExpireRpcResult;
    const expiredRows = Array.isArray(result.expired) ? result.expired : [];
    const expiredCount = typeof result.expired_count === "number"
      ? result.expired_count
      : expiredRows.length;

    let auditInserted = 0;
    let auditSkipped = 0;

    for (const row of expiredRows) {
      const subscriptionId = row.subscription_id;
      if (!subscriptionId || !row.company_id || !row.trial_ends_at) {
        continue;
      }

      const { error: logError } = await supabaseAdmin.from("trial_expiration_log").insert({
        subscription_id: subscriptionId,
        company_id: row.company_id,
        plan_id: row.plan_id ?? null,
        trial_ends_at: row.trial_ends_at,
        scheduler_run_id: runLogId,
      });

      if (logError) {
        if (logError.code === "23505") {
          auditSkipped++;
        } else {
          console.warn(
            "[trial-expiration-scheduler] audit log failed:",
            subscriptionId,
            logError.message,
          );
        }
        continue;
      }
      auditInserted++;
    }

    const details = {
      limit,
      expired: expiredRows,
      audit_inserted: auditInserted,
      audit_skipped: auditSkipped,
    };

    await finishRunLog({
      status: "success",
      processedCount: expiredCount,
      expiredCount,
      details,
    });

    console.log(
      `[trial-expiration-scheduler] expired=${expiredCount} audit_inserted=${auditInserted}`,
    );

    return jsonResponse({
      success: true,
      expired_count: expiredCount,
      audit_inserted: auditInserted,
      audit_skipped: auditSkipped,
      run_id: runLogId,
    }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[trial-expiration-scheduler] Uncaught:", message);
    await finishRunLog({
      status: "error",
      processedCount: 0,
      expiredCount: 0,
      errorMessage: message,
    });
    return jsonResponse({ success: false, error: message }, 500);
  }
});
