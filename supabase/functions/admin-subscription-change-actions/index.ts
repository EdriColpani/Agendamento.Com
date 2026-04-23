import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GLOBAL_ADMIN_CODES = ["GLOBAL_ADMIN", "ADMIN_GLOBAL", "ADMINISTRADOR_GLOBAL", "SUPER_ADMIN"];

type ScheduledChangeRow = {
  id: string;
  company_id: string;
  subscription_id: string;
  to_plan_id: string;
};

async function applyScheduledDowngrades(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  limit: number,
  userId: string,
  actionNote: string,
) {
  const nowIso = new Date().toISOString();
  const { data: changesData, error: changesError } = await supabaseAdmin
    .from("subscription_change_requests")
    .select("id, company_id, subscription_id, to_plan_id")
    .eq("company_id", companyId)
    .eq("change_type", "downgrade")
    .eq("status", "scheduled")
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: true })
    .limit(limit);

  if (changesError) {
    throw new Error(changesError.message);
  }

  const changes = (changesData ?? []) as ScheduledChangeRow[];
  let applied = 0;
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
          last_action_by_user_id: userId,
          last_action_note: actionNote,
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
        .update({
          status: "failed",
          failure_reason: reason,
          last_action_by_user_id: userId,
          last_action_note: actionNote,
        })
        .eq("id", change.id)
        .eq("status", "scheduled");
    }
  }

  return {
    processed: changes.length,
    applied,
    failed: failures.length,
    failures,
  };
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

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
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
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token or user not found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const companyId = String(body?.companyId ?? "").trim();
    const action = String(body?.action ?? "").trim();
    const reason = String(body?.reason ?? "").trim();
    const daysRaw = Number(body?.days ?? 7);
    const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.min(Math.floor(daysRaw), 30) : 7;
    const limitRaw = Number(body?.limit ?? 200);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.floor(limitRaw), 500) : 200;
    const maxRetriesRaw = Number(body?.maxRetries ?? 3);
    const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 1 ? Math.min(Math.floor(maxRetriesRaw), 10) : 3;

    if (!companyId || !action) {
      return new Response(JSON.stringify({ error: "companyId e action são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!reason) {
      return new Response(JSON.stringify({ error: "Motivo da ação é obrigatório para auditoria." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: globalAdminRows } = await supabaseAdmin
      .from("type_user")
      .select("cod")
      .eq("user_id", user.id)
      .in("cod", GLOBAL_ADMIN_CODES)
      .limit(1);
    const isGlobalAdmin = !!globalAdminRows?.length;

    if (!isGlobalAdmin) {
      return new Response(JSON.stringify({ error: "Ação permitida apenas para Administrador Global." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "retry_failed") {
      const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data: failedRows, error: failedError } = await supabaseAdmin
        .from("subscription_change_requests")
        .select("id, change_type, failure_reason, retry_count")
        .eq("company_id", companyId)
        .eq("status", "failed")
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (failedError) throw new Error(failedError.message);

      const retryable = (failedRows ?? []).filter((row: any) => {
        if (row.change_type !== "downgrade") return false;
        const retryCount = Number(row.retry_count ?? 0);
        return retryCount < maxRetries;
      });
      if (!retryable.length) {
        return new Response(JSON.stringify({
          ok: true,
          action,
          retried: 0,
          message: "Nenhuma falha recuperável encontrada para downgrade dentro da política de retry.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const nowIso = new Date().toISOString();
      const retriedIds: string[] = [];
      for (const row of retryable) {
        const nextRetryCount = Number(row.retry_count ?? 0) + 1;
        const { error: retryError } = await supabaseAdmin
          .from("subscription_change_requests")
          .update({
            status: "scheduled",
            effective_at: nowIso,
            failure_reason: null,
            retry_count: nextRetryCount,
            last_retried_at: nowIso,
            last_action_by_user_id: user.id,
            last_action_note: reason,
          })
          .eq("id", row.id)
          .eq("status", "failed");

        if (!retryError) {
          retriedIds.push(row.id);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        action,
        retried: retriedIds.length,
        max_retries: maxRetries,
        reason,
        message: "Falhas de downgrade reenfileiradas para reprocessamento.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "run_scheduler") {
      const result = await applyScheduledDowngrades(supabaseAdmin, companyId, limit, user.id, reason);
      return new Response(JSON.stringify({
        ok: true,
        action,
        reason,
        ...result,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida. Use retry_failed ou run_scheduler." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? "Erro ao executar ação administrativa." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

