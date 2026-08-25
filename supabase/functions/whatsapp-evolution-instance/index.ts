import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "ensure" | "get" | "connect" | "disconnect" | "sync_status" | "get_qr";

type WhatsAppInstanceRow = {
  id: string;
  company_id: string;
  instance_name: string;
  provider: string;
  status: string;
  connected_phone: string | null;
  connected_at: string | null;
  last_activity_at: string | null;
  last_disconnected_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  metadata: Record<string, unknown>;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function evolutionApiUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
}

function evolutionApiKey(): string {
  return Deno.env.get("EVOLUTION_API_KEY") || "";
}

function mapEvolutionState(raw: unknown): string {
  const state = String(raw || "").toLowerCase();
  if (state === "open" || state === "connected") return "CONNECTED";
  if (state === "connecting" || state.includes("qr")) return "CONNECTING";
  if (state === "close" || state === "closed" || state.includes("disconnect")) return "DISCONNECTED";
  if (state.includes("error")) return "ERROR";
  return "DISCONNECTED";
}

async function evolutionRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${evolutionApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let responseBody: unknown = null;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = await res.text().catch(() => null);
    }

    return { ok: res.ok, status: res.status, body: responseBody };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: { error: message } };
  } finally {
    clearTimeout(timeout);
  }
}

function requiresEvolution(action: Action): boolean {
  return action === "connect" || action === "get_qr" || action === "disconnect" || action === "sync_status";
}

function assertEvolutionConfigured(): Response | null {
  if (!evolutionApiUrl() || !evolutionApiKey()) {
    return jsonResponse({ error: "Evolution API não configurada no servidor." }, 503);
  }
  return null;
}

async function assertProprietarioOrAdmin(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: userCompany, error } = await supabaseAdmin
    .from("user_companies")
    .select("role_type")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !userCompany?.role_type) {
    return { ok: false, message: "Sem vínculo com esta empresa." };
  }

  const { data: roleType } = await supabaseAdmin
    .from("role_types")
    .select("description")
    .eq("id", userCompany.role_type)
    .maybeSingle();

  const desc = (roleType?.description || "").trim().toLowerCase();
  const normalized = desc.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!["proprietario", "admin", "proprietário"].includes(normalized)) {
    return { ok: false, message: 'Apenas Proprietário ou Admin podem gerenciar WhatsApp.' };
  }

  return { ok: true };
}

async function ensureInstanceRow(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
): Promise<{ ok: true; instance: WhatsAppInstanceRow } | { ok: false; message: string }> {
  const { data, error } = await supabaseAdmin.rpc("ensure_whatsapp_instance", {
    p_company_id: companyId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const parsed = data as { success?: boolean; error?: string; instance?: WhatsAppInstanceRow };
  if (!parsed?.success || !parsed.instance) {
    return { ok: false, message: parsed?.error || "Falha ao garantir instância WhatsApp." };
  }

  return { ok: true, instance: parsed.instance };
}

async function patchInstanceStatus(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  status: string,
  extras?: { connected_phone?: string | null; last_error?: string | null; metadata_patch?: Record<string, unknown> },
) {
  await supabaseAdmin.rpc("update_whatsapp_instance_status", {
    p_company_id: companyId,
    p_status: status,
    p_connected_phone: extras?.connected_phone ?? null,
    p_last_error: extras?.last_error ?? null,
    p_metadata_patch: extras?.metadata_patch ?? null,
  });
}

function extractQr(body: any): { qr: string | null; pairingCode: string | null } {
  const base64 =
    body?.base64 ||
    body?.qrcode?.base64 ||
    body?.instance?.qrcode?.base64 ||
    null;
  const code = body?.code || body?.qrcode?.code || body?.pairingCode || null;
  return { qr: base64 || code, pairingCode: body?.pairingCode || null };
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Método não permitido." }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Serviço indisponível." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sessão inválida." }, 401);
    }

    let payload: { action?: Action; company_id?: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "JSON inválido." }, 400);
    }

    const action = payload.action;
    const companyId = payload.company_id;

    if (!action || !companyId) {
      return jsonResponse({ error: "action e company_id são obrigatórios." }, 400);
    }

    if (requiresEvolution(action)) {
      const evolutionError = assertEvolutionConfigured();
      if (evolutionError) return evolutionError;
    }

    const perm = await assertProprietarioOrAdmin(supabaseAdmin, userData.user.id, companyId);
    if (!perm.ok) {
      return jsonResponse({ error: perm.message }, 403);
    }

    if (action === "get") {
      const { data, error } = await supabaseAdmin.rpc("get_whatsapp_instance", {
        p_company_id: companyId,
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse(data);
    }

    const ensured = await ensureInstanceRow(supabaseAdmin, companyId);
    if (!ensured.ok) {
      return jsonResponse({ error: ensured.message }, 500);
    }

    const instance = ensured.instance;
    const name = instance.instance_name;

    if (action === "ensure") {
      return jsonResponse({ success: true, instance });
    }

    if (action === "connect" || action === "get_qr") {
      await patchInstanceStatus(supabaseAdmin, companyId, "CONNECTING");

      const created = await evolutionRequest("POST", "/instance/create", {
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });

      const connect = created.ok
        ? created
        : await evolutionRequest("GET", `/instance/connect/${encodeURIComponent(name)}`);

      const qrInfo = extractQr(connect.body);

      if (!connect.ok && !qrInfo.qr) {
        await patchInstanceStatus(supabaseAdmin, companyId, "ERROR", {
          last_error: `Falha ao conectar Evolution (${connect.status})`,
        });
        return jsonResponse({
          success: false,
          error: "Não foi possível obter QR Code.",
          detail: connect.body,
        }, 502);
      }

      return jsonResponse({
        success: true,
        instance_name: name,
        status: "CONNECTING",
        qr: qrInfo.qr,
        pairingCode: qrInfo.pairingCode,
      });
    }

    if (action === "disconnect") {
      const logout = await evolutionRequest("DELETE", `/instance/logout/${encodeURIComponent(name)}`);
      await patchInstanceStatus(supabaseAdmin, companyId, "DISCONNECTED", {
        last_error: logout.ok ? null : `Logout Evolution status ${logout.status}`,
      });

      const { data } = await supabaseAdmin.rpc("get_whatsapp_instance", { p_company_id: companyId });
      return jsonResponse({ success: logout.ok, instance: (data as any)?.instance ?? null, detail: logout.body });
    }

    if (action === "sync_status") {
      const stateRes = await evolutionRequest(
        "GET",
        `/instance/connectionState/${encodeURIComponent(name)}`,
      );

      const rawState =
        (stateRes.body as any)?.instance?.state ||
        (stateRes.body as any)?.state ||
        (stateRes.body as any)?.status ||
        null;

      const mapped = mapEvolutionState(rawState);
      const phone =
        (stateRes.body as any)?.instance?.owner ||
        (stateRes.body as any)?.owner ||
        null;

      await patchInstanceStatus(supabaseAdmin, companyId, mapped, {
        connected_phone: mapped === "CONNECTED" ? phone : null,
        last_error: stateRes.ok ? null : `sync_status HTTP ${stateRes.status}`,
        metadata_patch: { last_evolution_state: rawState },
      });

      const { data } = await supabaseAdmin.rpc("get_whatsapp_instance", { p_company_id: companyId });
      return jsonResponse({
        success: true,
        evolution_state: rawState,
        instance: (data as any)?.instance ?? null,
      });
    }

    return jsonResponse({ error: `Ação inválida: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno.";
    console.error("[whatsapp-evolution-instance]", message, err);
    return jsonResponse({ error: message }, 500);
  }
});
