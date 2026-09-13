import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { sendAndLogTrialReminder } from "./trial-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ERROR_MESSAGES: Record<string, string> = {
  trial_disabled: "O período de teste gratuito não está disponível no momento.",
  missing_params: "Empresa e plano são obrigatórios.",
  company_not_found: "Empresa não encontrada.",
  trial_already_used: "Esta empresa já utilizou o período de teste gratuito.",
  invalid_plan: "Plano inválido ou inativo.",
  already_subscribed: "Esta empresa já possui assinatura ativa.",
  subscription_exists: "Já existe uma assinatura em andamento para esta empresa.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const body = await req.json();
    const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
    const planId = typeof body?.planId === "string" ? body.planId.trim() : "";

    if (!companyId || !planId) {
      return jsonResponse({ error: "companyId e planId são obrigatórios." }, 400);
    }

    const { data: companyRow, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, user_id")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError || !companyRow) {
      return jsonResponse({ error: "Empresa não encontrada." }, 404);
    }

    const isOwner = companyRow.user_id === user.id;
    let isAdmin = false;

    if (!isOwner) {
      const { data: membership } = await supabaseAdmin
        .from("user_companies")
        .select("role_type")
        .eq("user_id", user.id)
        .eq("company_id", companyId)
        .maybeSingle();

      isAdmin = membership?.role_type === 1;
    }

    if (!isOwner && !isAdmin) {
      return jsonResponse({ error: "Sem permissão para iniciar trial nesta empresa." }, 403);
    }

    const { data: result, error: rpcError } = await supabaseAdmin.rpc(
      "start_company_trial_subscription",
      { p_company_id: companyId, p_plan_id: planId },
    );

    if (rpcError) {
      console.error("[start-trial-subscription] RPC error:", rpcError.message);
      return jsonResponse({ error: "Erro ao iniciar período de teste." }, 500);
    }

    const rpcResult = result as {
      success?: boolean;
      error?: string;
      subscription_id?: string;
      plan_name?: string;
      trial_days?: number;
      trial_ends_at?: string;
    } | null;
    if (!rpcResult?.success) {
      const code = rpcResult?.error ?? "unknown";
      return jsonResponse(
        { error: ERROR_MESSAGES[code] ?? "Não foi possível iniciar o teste gratuito." },
        400,
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY && rpcResult.subscription_id) {
      const { data: companyDetails } = await supabaseAdmin
        .from("companies")
        .select("name, company_email")
        .eq("id", companyId)
        .maybeSingle();

      const toEmail = String(companyDetails?.company_email || user.email || "").trim();
      if (toEmail) {
        try {
          await sendAndLogTrialReminder(supabaseAdmin, RESEND_API_KEY, {
            companyId,
            subscriptionId: String(rpcResult.subscription_id),
            toEmail,
            day: 0,
            companyName: companyDetails?.name || "Cliente",
            planName: typeof rpcResult.plan_name === "string" ? rpcResult.plan_name : null,
            trialDays: Number(rpcResult.trial_days) || 15,
            trialEndsAt: typeof rpcResult.trial_ends_at === "string" ? rpcResult.trial_ends_at : null,
          });
        } catch (emailErr: unknown) {
          console.warn("[start-trial-subscription] Trial welcome email failed (non-fatal):", emailErr);
        }
      }
    }

    return jsonResponse({
      message: "Período de teste iniciado com sucesso.",
      ...rpcResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    console.error("[start-trial-subscription] Uncaught:", message);
    return jsonResponse({ error: message }, 500);
  }
});
