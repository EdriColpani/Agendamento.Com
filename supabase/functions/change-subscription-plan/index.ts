import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YEARLY_DISCOUNT_FACTOR = 0.85;
const UPGRADE_REFERENCE_PREFIX = "subchange:";

type BillingPeriod = "monthly" | "yearly";
type PlanRow = { id: string; name: string; price: number; status: string };
type ActiveSubscriptionRow = {
  id: string;
  company_id: string;
  plan_id: string;
  start_date: string | null;
  end_date: string | null;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
};

const toUtcDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

function getCyclePrice(planPrice: number, period: BillingPeriod): number {
  if (period === "yearly") {
    return Math.round(planPrice * 12 * YEARLY_DISCOUNT_FACTOR * 100) / 100;
  }
  return Math.round(planPrice * 100) / 100;
}

function detectCurrentBillingPeriod(subscription: ActiveSubscriptionRow): BillingPeriod {
  const startRaw = subscription.billing_cycle_start ?? subscription.start_date;
  const endRaw = subscription.billing_cycle_end ?? subscription.end_date;
  if (!startRaw || !endRaw) return "monthly";
  const days = Math.max(1, Math.ceil((toUtcDate(endRaw).getTime() - toUtcDate(startRaw).getTime()) / 86400000));
  return days >= 330 ? "yearly" : "monthly";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get("PAYMENT_API_KEY_SECRET");
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.planoagenda.com.br";

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized: No Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token or user not found" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const companyId = String(body?.companyId ?? "").trim();
    const targetPlanId = String(body?.targetPlanId ?? "").trim();
    const billingPeriod = (body?.billingPeriod === "yearly" ? "yearly" : "monthly") as BillingPeriod;

    if (!companyId || !targetPlanId) {
      return new Response(JSON.stringify({ error: "companyId e targetPlanId são obrigatórios." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: userCompany } = await supabaseAdmin
      .from("user_companies")
      .select("role_type")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    const { data: roleType } = userCompany?.role_type
      ? await supabaseAdmin.from("role_types").select("description").eq("id", userCompany.role_type).maybeSingle()
      : { data: null };

    const normalizedRole = String(roleType?.description ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const hasCompanyPermission = normalizedRole === "proprietario" || normalizedRole === "admin";

    const { data: globalAdminType } = await supabaseAdmin
      .from("type_user")
      .select("cod")
      .eq("user_id", user.id)
      .in("cod", ["GLOBAL_ADMIN", "ADMIN_GLOBAL", "ADMINISTRADOR_GLOBAL", "SUPER_ADMIN"])
      .limit(1);

    if (!hasCompanyPermission && (!globalAdminType || globalAdminType.length === 0)) {
      return new Response(JSON.stringify({ error: "Você não tem permissão para alterar o plano desta empresa." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: subscriptionData, error: subscriptionError } = await supabaseAdmin
      .from("company_subscriptions")
      .select("id, company_id, plan_id, start_date, end_date, billing_cycle_start, billing_cycle_end")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    const subscription = subscriptionData as ActiveSubscriptionRow | null;
    if (!subscription) {
      return new Response(JSON.stringify({ error: "Nenhuma assinatura ativa encontrada para esta empresa." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: plans, error: plansError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, price, status")
      .in("id", [subscription.plan_id, targetPlanId]);

    if (plansError) throw plansError;

    const currentPlan = (plans || []).find((p) => p.id === subscription.plan_id) as PlanRow | undefined;
    const targetPlan = (plans || []).find((p) => p.id === targetPlanId) as PlanRow | undefined;

    if (!currentPlan || !targetPlan) {
      return new Response(JSON.stringify({ error: "Plano atual ou plano destino não encontrado." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (targetPlan.status !== "active") {
      return new Response(JSON.stringify({ error: "O plano selecionado não está ativo." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currentPeriod = detectCurrentBillingPeriod(subscription);
    if (subscription.plan_id === targetPlanId && currentPeriod === billingPeriod) {
      return new Response(JSON.stringify({ error: "A empresa já está neste plano e período." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currentCyclePrice = getCyclePrice(Number(currentPlan.price), currentPeriod);
    const targetCyclePrice = getCyclePrice(Number(targetPlan.price), billingPeriod);
    const isUpgrade = targetCyclePrice > currentCyclePrice;

    const cycleStartRaw = subscription.billing_cycle_start ?? subscription.start_date;
    const cycleEndRaw = subscription.billing_cycle_end ?? subscription.end_date;
    const now = new Date();

    let cycleDays = 30;
    let remainingDays = 30;
    let effectiveAt = now.toISOString();

    if (cycleStartRaw && cycleEndRaw) {
      const cycleStart = toUtcDate(cycleStartRaw);
      const cycleEnd = toUtcDate(cycleEndRaw);
      cycleDays = Math.max(1, Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / 86400000));
      remainingDays = Math.max(0, Math.ceil((cycleEnd.getTime() - now.getTime()) / 86400000));
      effectiveAt = cycleEnd.toISOString();
    }

    const rawProration = ((targetCyclePrice - currentCyclePrice) * remainingDays) / cycleDays;
    const prorationAmount = Math.max(0, Math.round(rawProration * 100) / 100);

    if (!isUpgrade) {
      const { error: cancelScheduledError } = await supabaseAdmin
        .from("subscription_change_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("subscription_id", subscription.id)
        .eq("status", "scheduled");
      if (cancelScheduledError) throw cancelScheduledError;

      const { error: insertScheduledError } = await supabaseAdmin
        .from("subscription_change_requests")
        .insert({
          company_id: companyId,
          subscription_id: subscription.id,
          from_plan_id: subscription.plan_id,
          to_plan_id: targetPlanId,
          change_type: "downgrade",
          status: "scheduled",
          billing_period: billingPeriod,
          proration_amount: 0,
          effective_at: effectiveAt,
          requested_by_user_id: user.id,
        });
      if (insertScheduledError) throw insertScheduledError;

      const { error: markSubError } = await supabaseAdmin
        .from("company_subscriptions")
        .update({ next_plan_id: targetPlanId, pending_change_type: "downgrade" })
        .eq("id", subscription.id);
      if (markSubError) throw markSubError;

      return new Response(JSON.stringify({
        changeType: "downgrade",
        paymentRequired: false,
        amountDue: 0,
        effectiveAt,
        message: "Downgrade agendado para o fim do ciclo atual.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: clearPendingChangesError } = await supabaseAdmin
      .from("subscription_change_requests")
      .update({ status: "cancelled", failure_reason: "Substituída por nova solicitação de upgrade." })
      .eq("subscription_id", subscription.id)
      .in("status", ["pending_payment", "scheduled"]);
    if (clearPendingChangesError) throw clearPendingChangesError;

    await supabaseAdmin
      .from("company_subscriptions")
      .update({ next_plan_id: null, pending_change_type: null })
      .eq("id", subscription.id);

    if (prorationAmount < 0.5) {
      const { error: applyError } = await supabaseAdmin
        .from("company_subscriptions")
        .update({ plan_id: targetPlanId, next_plan_id: null, pending_change_type: null })
        .eq("id", subscription.id);
      if (applyError) throw applyError;

      await supabaseAdmin.rpc("sync_company_flags_from_plan", {
        p_company_id: companyId,
        p_plan_id: targetPlanId,
      });

      await supabaseAdmin.from("subscription_change_requests").insert({
        company_id: companyId,
        subscription_id: subscription.id,
        from_plan_id: subscription.plan_id,
        to_plan_id: targetPlanId,
        change_type: "upgrade",
        status: "applied",
        billing_period: billingPeriod,
        proration_amount: prorationAmount,
        effective_at: now.toISOString(),
        requested_by_user_id: user.id,
        applied_at: now.toISOString(),
      });

      return new Response(JSON.stringify({
        changeType: "upgrade",
        paymentRequired: false,
        amountDue: prorationAmount,
        effectiveAt: now.toISOString(),
        message: "Upgrade aplicado imediatamente sem cobrança adicional.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!MERCADOPAGO_ACCESS_TOKEN) {
      return new Response(JSON.stringify({ error: "Serviço de pagamento não configurado." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: paymentAttempt, error: paymentAttemptError } = await supabaseAdmin
      .from("payment_attempts")
      .insert({
        company_id: companyId,
        plan_id: targetPlanId,
        user_id: user.id,
        status: "initiated",
        amount: prorationAmount,
        currency: "BRL",
      })
      .select("id")
      .single();
    if (paymentAttemptError) throw paymentAttemptError;

    const { data: changeRequest, error: changeInsertError } = await supabaseAdmin
      .from("subscription_change_requests")
      .insert({
        company_id: companyId,
        subscription_id: subscription.id,
        from_plan_id: subscription.plan_id,
        to_plan_id: targetPlanId,
        change_type: "upgrade",
        status: "pending_payment",
        billing_period: billingPeriod,
        proration_amount: prorationAmount,
        effective_at: now.toISOString(),
        payment_attempt_id: paymentAttempt.id,
        requested_by_user_id: user.id,
      })
      .select("id")
      .single();
    if (changeInsertError) throw changeInsertError;

    const externalReference = `${UPGRADE_REFERENCE_PREFIX}${changeRequest.id}:${paymentAttempt.id}`;
    const preferenceBody = {
      items: [{ title: `Upgrade de plano (${targetPlan.name})`, unit_price: prorationAmount, quantity: 1, currency_id: "BRL" }],
      external_reference: externalReference,
      back_urls: {
        success: `${SITE_URL}/planos?status=success`,
        failure: `${SITE_URL}/planos?status=failure`,
        pending: `${SITE_URL}/planos?status=pending`,
      },
      auto_return: "approved",
      notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
      body: JSON.stringify(preferenceBody),
    });
    if (!mpResponse.ok) {
      const raw = await mpResponse.text();
      await supabaseAdmin.from("payment_attempts").update({ status: "failed" }).eq("id", paymentAttempt.id);
      await supabaseAdmin.from("subscription_change_requests").update({ status: "failed", failure_reason: raw }).eq("id", changeRequest.id);
      throw new Error(`Mercado Pago erro ${mpResponse.status}: ${raw}`);
    }

    const mpData = await mpResponse.json();
    await supabaseAdmin.from("payment_attempts").update({ payment_gateway_reference: String(mpData.id) }).eq("id", paymentAttempt.id);
    await supabaseAdmin.from("subscription_change_requests").update({ payment_gateway_reference: String(mpData.id) }).eq("id", changeRequest.id);

    return new Response(JSON.stringify({
      changeType: "upgrade",
      paymentRequired: true,
      amountDue: prorationAmount,
      effectiveAt: now.toISOString(),
      initPoint: mpData.init_point,
      preferenceId: mpData.id,
      changeRequestId: changeRequest.id,
      paymentAttemptId: paymentAttempt.id,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[change-subscription-plan] error:", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Erro desconhecido ao alterar plano." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

