import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GLOBAL_ADMIN_CODES = ["GLOBAL_ADMIN", "ADMIN_GLOBAL", "ADMINISTRADOR_GLOBAL", "SUPER_ADMIN"];

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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env vars ausentes." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { window_hours?: number; latest_limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional
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

  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: typeRows, error: roleErr } = await supabaseAdmin
    .from("type_user")
    .select("cod")
    .eq("user_id", user.id);
  if (roleErr) {
    return new Response(JSON.stringify({ error: "Erro ao validar papel do usuário." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isGlobalAdmin = (typeRows ?? []).some((row) =>
    row?.cod && GLOBAL_ADMIN_CODES.includes(String(row.cod).toUpperCase())
  );
  if (!isGlobalAdmin) {
    return new Response(JSON.stringify({ error: "Acesso negado. Requer admin global." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    return new Response(JSON.stringify({ error: latestErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data: aggRows, error: aggErr } = await supabaseAdmin
    .from("court_booking_payment_timeout_runs")
    .select("status, cancelled_count")
    .gte("started_at", sinceIso);

  if (aggErr) {
    return new Response(JSON.stringify({ error: aggErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = aggRows ?? [];
  const summary = {
    window_hours: windowHours,
    runs_window: rows.length,
    errors_window: rows.filter((r) => r.status === "error").length,
    cancelled_window: rows.reduce((acc, row) => acc + Number(row.cancelled_count ?? 0), 0),
  };

  return new Response(JSON.stringify({
    ok: true,
    summary,
    latest_runs: latestRuns ?? [],
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
