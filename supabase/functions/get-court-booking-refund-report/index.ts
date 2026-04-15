import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  window_hours?: number;
  latest_limit?: number;
  company_id?: string;
};

function normalizeRole(input: string): string {
  return input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
    return { ok: false, status: 403, message: "Acesso negado. Requer Proprietário/Admin da empresa." };
  }

  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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
    return new Response(JSON.stringify({ error: "Supabase env vars ausentes." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }

  const windowHoursRaw = Number(body.window_hours ?? 24 * 7);
  const windowHours = Number.isFinite(windowHoursRaw) && windowHoursRaw >= 1
    ? Math.min(Math.floor(windowHoursRaw), 24 * 90)
    : 24 * 7;
  const latestLimitRaw = Number(body.latest_limit ?? 30);
  const latestLimit = Number.isFinite(latestLimitRaw) && latestLimitRaw >= 1
    ? Math.min(Math.floor(latestLimitRaw), 120)
    : 30;
  const companyIdFilter = typeof body.company_id === "string" ? body.company_id.trim() : "";
  if (!companyIdFilter) {
    return new Response(JSON.stringify({ error: "company_id é obrigatório." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized: No Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const perm = await assertProprietarioOrAdmin(supabaseAdmin, authData.user.id, companyIdFilter);
  if (!perm.ok) {
    return new Response(JSON.stringify({ error: perm.message }), {
      status: perm.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data: cancelledRows, error: cancelledErr } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, cancellation_reason, mp_payment_status, cancelled_at, status")
    .eq("company_id", companyIdFilter)
    .eq("booking_kind", "court")
    .eq("status", "cancelado")
    .gte("cancelled_at", sinceIso)
    .limit(3000);
  if (cancelledErr) {
    return new Response(JSON.stringify({ error: cancelledErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: latestAttempts, error: attemptsErr } = await supabaseAdmin
    .from("court_booking_refund_attempts")
    .select("id, appointment_id, company_id, mp_payment_id, payment_type_id, payment_method_id, status, mp_refund_status, error_message, attempted_at, finished_at")
    .eq("company_id", companyIdFilter)
    .gte("attempted_at", sinceIso)
    .order("attempted_at", { ascending: false })
    .limit(latestLimit);
  if (attemptsErr) {
    return new Response(JSON.stringify({ error: attemptsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Esta tabela de runs é global (sem company_id). Para evitar vazamento entre empresas,
  // não retornamos runs por empresa nesta versão.
  const runRows: unknown[] = [];

  const rows = cancelledRows ?? [];
  const reasonMap = new Map<string, number>();
  for (const row of rows) {
    const key = row.cancellation_reason?.trim() || "(sem motivo informado)";
    reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
  }
  const topReasons = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const attemptRows = latestAttempts ?? [];
  const paymentTypeCountMap = new Map<string, number>();
  for (const row of attemptRows) {
    const key = row.payment_type_id || "desconhecido";
    paymentTypeCountMap.set(key, (paymentTypeCountMap.get(key) ?? 0) + 1);
  }
  const paymentTypeCounts = Array.from(paymentTypeCountMap.entries())
    .map(([payment_type_id, count]) => ({ payment_type_id, count }))
    .sort((a, b) => b.count - a.count);

  const summary = {
    window_hours: windowHours,
    total_cancelled: rows.length,
    refund_approved: rows.filter((r) => r.mp_payment_status === "refund_approved").length,
    refund_pending_manual: rows.filter((r) => r.mp_payment_status === "refund_pending_manual").length,
    refund_in_progress: rows.filter((r) => r.mp_payment_status === "refund_in_progress").length,
    no_reason_count: rows.filter((r) => !r.cancellation_reason || !r.cancellation_reason.trim()).length,
  };

  return new Response(JSON.stringify({
    ok: true,
    summary,
    top_reasons: topReasons,
    payment_type_counts: paymentTypeCounts,
    latest_attempts: attemptRows,
    latest_reconciliation_runs: runRows ?? [],
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
