import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[cancel-subscription] Missing Supabase environment variables. URL or keys not configured."
    );
    return new Response(
      JSON.stringify({ error: "Supabase environment not fully configured." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1. Autenticar usuário pelo token do header Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[cancel-subscription] Missing Authorization header.");
      return new Response(
        JSON.stringify({ error: "Unauthorized: No Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error(
        "[cancel-subscription] Auth error:",
        userError?.message || "User not found"
      );
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token or user not found" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Ler body
    let body: any;
    try {
      body = await req.json();
    } catch (parseError: any) {
      console.error(
        "[cancel-subscription] Failed to parse request body:",
        parseError?.message
      );
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body: " + (parseError?.message || "Unknown error"),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { companyId, subscriptionId } = body || {};

    if (!companyId || typeof companyId !== "string" || companyId.trim() === "") {
      console.error("[cancel-subscription] Missing or invalid companyId:", companyId);
      return new Response(
        JSON.stringify({ error: "Parâmetro companyId é obrigatório." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!subscriptionId || typeof subscriptionId !== "string" || subscriptionId.trim() === "") {
      console.error("[cancel-subscription] Missing or invalid subscriptionId:", subscriptionId);
      return new Response(
        JSON.stringify({ error: "Parâmetro subscriptionId é obrigatório." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[cancel-subscription] Request:", {
      user_id: user.id,
      companyId,
      subscriptionId,
    });

    // 3. Garantir que o usuário tem permissão (Proprietário/Admin) nessa empresa
    const { data: userCompany, error: userCompanyError } = await supabaseAdmin
      .from("user_companies")
      .select("role_type")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (userCompanyError) {
      console.error(
        "[cancel-subscription] Error fetching user_companies:",
        userCompanyError
      );
      return new Response(
        JSON.stringify({
          error:
            "Erro ao validar permissões do usuário para a empresa. Tente novamente ou contate o suporte.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!userCompany || !userCompany.role_type) {
      console.error(
        "[cancel-subscription] User does not belong to company or role_type is null.",
        { user_id: user.id, companyId, userCompany }
      );
      return new Response(
        JSON.stringify({
          error:
            "Você não tem permissão para gerenciar a assinatura desta empresa. Verifique se você é Proprietário ou Admin.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar descrição da role para validar se é Proprietário/Admin
    const { data: roleTypeData, error: roleTypeError } = await supabaseAdmin
      .from("role_types")
      .select("description")
      .eq("id", userCompany.role_type)
      .maybeSingle();

    if (roleTypeError) {
      console.error(
        "[cancel-subscription] Error fetching role_types:",
        roleTypeError
      );
      return new Response(
        JSON.stringify({
          error:
            "Erro ao verificar o papel do usuário na empresa. Tente novamente ou contate o suporte.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const roleDescription = (roleTypeData?.description || "").trim().toLowerCase();
    const allowedRoles = ["proprietário", "admin", "proprietario"];
    const hasPermission = allowedRoles.some((allowed) => {
      const normalizedAllowed = allowed
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const normalizedRole = roleDescription
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return normalizedAllowed === normalizedRole;
    });

    if (!hasPermission) {
      console.error("[cancel-subscription] User does not have required role:", {
        user_id: user.id,
        companyId,
        roleDescription,
      });
      return new Response(
        JSON.stringify({
          error:
            'Você não tem permissão para cancelar a assinatura. É necessário ser "Proprietário" ou "Admin" da empresa.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Buscar assinatura para garantir que pertence à empresa
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("company_subscriptions")
      .select("id, company_id, status, end_date")
      .eq("id", subscriptionId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (subscriptionError) {
      console.error(
        "[cancel-subscription] Error fetching subscription:",
        subscriptionError
      );
      return new Response(
        JSON.stringify({ error: "Erro ao buscar assinatura para cancelamento." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!subscription) {
      console.error("[cancel-subscription] Subscription not found for company:", {
        subscriptionId,
        companyId,
      });
      return new Response(
        JSON.stringify({
          error:
            "Assinatura não encontrada para esta empresa. Atualize a página e tente novamente.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (subscription.status === "canceled") {
      console.log(
        "[cancel-subscription] Subscription already canceled, returning success."
      );
      return new Response(
        JSON.stringify({
          message:
            "A assinatura já estava cancelada. Você manterá o acesso até a data de expiração configurada.",
          subscription: subscription,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Atualizar status para "canceled" usando service_role (bypass RLS)
    const { data: updatedSub, error: updateError } = await supabaseAdmin
      .from("company_subscriptions")
      .update({ status: "canceled" })
      .eq("id", subscriptionId)
      .eq("company_id", companyId)
      .select("id, status, end_date")
      .maybeSingle();

    if (updateError) {
      console.error("[cancel-subscription] Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({
          error: "Erro ao cancelar assinatura. Tente novamente em instantes.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[cancel-subscription] Subscription canceled successfully:", updatedSub);

    return new Response(
      JSON.stringify({
        message:
          "Assinatura cancelada com sucesso! Você manterá o acesso até a data de expiração configurada.",
        subscription: updatedSub,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[cancel-subscription] Uncaught exception:", error);
    return jsonResponse({ error: "Erro interno ao cancelar assinatura." }, 500);
  }
});

