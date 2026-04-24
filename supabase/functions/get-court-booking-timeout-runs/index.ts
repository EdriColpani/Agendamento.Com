import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GLOBAL_ADMIN_CODES = ["GLOBAL_ADMIN", "ADMIN_GLOBAL", "ADMINISTRADOR_GLOBAL", "SUPER_ADMIN"];

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  let body: { window_hours?: number; latest_limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const { data: typeRows, error: roleErr } = await supabaseAdmin
    .from("type_user")
    .select("cod")
    .eq("user_id", user.id);
  if (roleErr) {
    return jsonResponse({ error: "Erro ao validar permissões do usuário." }, 500);
  }

  const isGlobalAdmin = (typeRows ?? []).some((row) =>
    row?.cod && GLOBAL_ADMIN_CODES.includes(String(row.cod).toUpperCase())
  );
  if (!isGlobalAdmin) {
    return jsonResponse({ error: "Acesso negado. Requer administrador global." }, 403);
  }

  const windowHoursRaw = Number(body.window_hours ?? 24);
  const windowHours = Number.isFinite(windowHoursRaw) && windowHoursRaw >= 1
    ? Math.min(Math.floor(windowHoursRaw), 24 * 30)
    : 24;

  const latestLimitRaw = Number(body.latest_limit ?? 20);
  const latestLimit = Number.isFinite(latestLimitRaw) && latestLimitRaw >= 1
    ? Math.min(Math.floor(latestLimitRaw), 100)
    : 20;

  const { data: latestRuns, error: latestErr } = await supabaseAdmin
    .from("court_booking_payment_timeout_runs")
    .select("id, status, timeout_minutes, scan_limit, found_count, cancelled_count, error_message, started_at, finished_at, duration_ms")
    .order("started_at", { ascending: false })
    .limit(latestLimit);

  if (latestErr) {
    return jsonResponse({ error: "Erro ao carregar execuções de timeout." }, 500);
  }

  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data: aggRows, error: aggErr } = await supabaseAdmin
    .from("court_booking_payment_timeout_runs")
    .select("status, cancelled_count")
    .gte("started_at", sinceIso);

  if (aggErr) {
    return jsonResponse({ error: "Erro ao consolidar dados de timeout." }, 500);
  }

  const rows = aggRows ?? [];
  const summary = {
    window_hours: windowHours,
    runs_window: rows.length,
    errors_window: rows.filter((r) => r.status === "error").length,
    cancelled_window: rows.reduce((acc, row) => acc + Number(row.cancelled_count ?? 0), 0),
  };

  return jsonResponse({
    ok: true,
    summary,
    latest_runs: latestRuns ?? [],
  }, 200);
});
