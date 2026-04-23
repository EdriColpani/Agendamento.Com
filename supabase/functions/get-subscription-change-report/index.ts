import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GLOBAL_ADMIN_CODES = ["GLOBAL_ADMIN", "ADMIN_GLOBAL", "ADMINISTRADOR_GLOBAL", "SUPER_ADMIN"];

type SummaryStatus = "pending_payment" | "scheduled" | "applied" | "failed" | "cancelled";

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

    let body: { companyId?: string; days?: number; statusFilter?: SummaryStatus | "all"; page?: number; pageSize?: number } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const companyId = String(body.companyId ?? "").trim();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const daysRaw = Number(body.days ?? 30);
    const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.min(Math.floor(daysRaw), 180) : 30;
    const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const statusFilter = (body.statusFilter ?? "all") as SummaryStatus | "all";
    const validStatusFilter = ["all", "pending_payment", "scheduled", "applied", "failed", "cancelled"].includes(statusFilter)
      ? statusFilter
      : "all";
    const pageRaw = Number(body.page ?? 1);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const pageSizeRaw = Number(body.pageSize ?? 10);
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 ? Math.min(Math.floor(pageSizeRaw), 50) : 10;
    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;

    const { data: globalAdminRows } = await supabaseAdmin
      .from("type_user")
      .select("cod")
      .eq("user_id", user.id)
      .in("cod", GLOBAL_ADMIN_CODES)
      .limit(1);
    const isGlobalAdmin = !!globalAdminRows?.length;

    if (!isGlobalAdmin) {
      return new Response(JSON.stringify({ error: "Relatório disponível apenas para Administrador Global." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statuses: SummaryStatus[] = ["pending_payment", "scheduled", "applied", "failed", "cancelled"];
    const summaryEntries = await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabaseAdmin
          .from("subscription_change_requests")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", status)
          .gte("created_at", fromIso);
        return { status, count: count ?? 0 };
      }),
    );

    const { data: recentFailures } = await supabaseAdmin
      .from("subscription_change_requests")
      .select("id, change_type, status, failure_reason, created_at, payment_attempt_id")
      .eq("company_id", companyId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: overdueScheduled } = await supabaseAdmin
      .from("subscription_change_requests")
      .select("id, change_type, status, effective_at, created_at")
      .eq("company_id", companyId)
      .eq("status", "scheduled")
      .lte("effective_at", new Date().toISOString())
      .order("effective_at", { ascending: true })
      .limit(20);

    const { data: recentRuns } = await supabaseAdmin
      .from("subscription_change_scheduler_runs")
      .select("id, status, started_at, finished_at, processed_count, applied_count, failed_count, stale_pending_marked_failed, error_message")
      .order("started_at", { ascending: false })
      .limit(20);

    let recentQuery = supabaseAdmin
      .from("subscription_change_requests")
      .select("id, change_type, status, failure_reason, created_at, effective_at, retry_count, last_retried_at, last_action_note", { count: "exact" })
      .eq("company_id", companyId)
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false });

    if (validStatusFilter !== "all") {
      recentQuery = recentQuery.eq("status", validStatusFilter);
    }

    const { data: recentRequests, count: recentRequestsCount } = await recentQuery.range(fromIndex, toIndex);

    const summary: Record<SummaryStatus, number> = {
      pending_payment: 0,
      scheduled: 0,
      applied: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const entry of summaryEntries) {
      summary[entry.status] = entry.count;
    }

    return new Response(JSON.stringify({
      company_id: companyId,
      period_days: days,
      from: fromIso,
      filter: {
        status: validStatusFilter,
        page,
        page_size: pageSize,
      },
      summary,
      recent_failures: recentFailures ?? [],
      overdue_scheduled: overdueScheduled ?? [],
      recent_scheduler_runs: recentRuns ?? [],
      recent_requests: recentRequests ?? [],
      recent_requests_total: recentRequestsCount ?? 0,
      recent_requests_has_more: (recentRequestsCount ?? 0) > (fromIndex + pageSize),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? "Erro ao gerar relatório." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

