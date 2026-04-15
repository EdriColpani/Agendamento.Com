import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CancelRequestBody = {
  appointment_id?: string;
  company_id?: string;
  client_id?: string;
  client_nickname?: string | null;
  observations?: string | null;
  cancellation_reason?: string | null;
};

function normalizeRole(input: string): string {
  return input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function safeText(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
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
    return { ok: false, status: 403, message: "Apenas Proprietário/Admin pode cancelar com política de reembolso." };
  }

  return { ok: true };
}

function buildObservations(existing: string | null, cancellationReason: string | null): string | null {
  const base = (existing ?? "").trim();
  const now = new Date().toISOString();
  const reasonPart = cancellationReason ? ` | motivo: ${cancellationReason}` : "";
  const marker = `[cancelamento_arena] ${now}${reasonPart}`;

  if (!base) return marker;
  return `${base}\n${marker}`.slice(0, 500);
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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Ambiente Supabase incompleto." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized: No Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CancelRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido no corpo." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appointmentId = typeof body.appointment_id === "string" ? body.appointment_id.trim() : "";
  const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  const clientNickname = safeText(body.client_nickname, 200);
  const observationsInput = safeText(body.observations, 500);
  const cancellationReason = safeText(body.cancellation_reason, 250);

  if (!appointmentId || !companyId || !clientId) {
    return new Response(JSON.stringify({ error: "appointment_id, company_id e client_id são obrigatórios." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const perm = await assertProprietarioOrAdmin(supabaseAdmin, authData.user.id, companyId);
  if (!perm.ok) {
    return new Response(JSON.stringify({ error: perm.message }), {
      status: perm.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: appointment, error: appointmentError } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, booking_kind, status, payment_method, mp_payment_id, mp_payment_status, observations")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return new Response(JSON.stringify({ error: "Reserva não encontrada." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (appointment.company_id !== companyId || appointment.booking_kind !== "court") {
    return new Response(JSON.stringify({ error: "A reserva informada não pertence ao módulo de quadras desta empresa." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (appointment.status === "concluido") {
    return new Response(JSON.stringify({ error: "Não é permitido cancelar reserva concluída." }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const normalizedMpStatus = String(appointment.mp_payment_status ?? "").trim().toLowerCase();
  const paidStatuses = new Set(["approved", "accredited", "authorized"]);
  const refundRequired =
    appointment.payment_method === "mercado_pago" &&
    !!appointment.mp_payment_id &&
    (paidStatuses.has(normalizedMpStatus) || appointment.status === "confirmado");

  const nextObservations = buildObservations(observationsInput ?? appointment.observations, cancellationReason);
  const patch: Record<string, unknown> = {
    client_id: clientId,
    client_nickname: clientNickname,
    observations: nextObservations,
    cancellation_reason: cancellationReason,
    cancelled_at: new Date().toISOString(),
    cancelled_by_user_id: authData.user.id,
    status: "cancelado",
  };

  if (refundRequired) {
    patch.mp_payment_status = "refund_pending_manual";
  } else if (!appointment.mp_payment_status) {
    patch.mp_payment_status = "cancelled_without_online_payment";
  }

  const { error: updateError } = await supabaseAdmin
    .from("appointments")
    .update(patch)
    .eq("id", appointmentId)
    .eq("company_id", companyId);

  if (updateError) {
    return new Response(JSON.stringify({ error: `Falha ao cancelar: ${updateError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      refund_required: refundRequired,
      message: refundRequired
        ? "Reserva cancelada e reembolso marcado para análise manual."
        : "Reserva cancelada com sucesso.",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
