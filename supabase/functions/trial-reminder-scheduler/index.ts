import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { sendAndLogTrialReminder } from "./trial-email.ts";

const SCHEDULER_REMINDER_DAYS = [7, 12, 15] as const;
type SchedulerReminderDay = (typeof SCHEDULER_REMINDER_DAYS)[number];

const TIME_ZONE = "America/Sao_Paulo";

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

function ymdInTz(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface TrialSubscriptionRow {
  id: string;
  company_id: string;
  trial_started_at: string;
  trial_ends_at: string | null;
  status: string;
  is_trial: boolean;
  subscription_plans: { name: string | null } | { name: string | null }[] | null;
  companies: { name: string | null; company_email: string | null } | { name: string | null; company_email: string | null }[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit) > 0 ? Number(body.limit) : 500;

    if (!RESEND_API_KEY) {
      console.warn("[trial-reminder-scheduler] RESEND_API_KEY não configurada.");
      return jsonResponse({ success: false, message: "Email service not configured" }, 200);
    }

    const { data: settings } = await supabaseAdmin.rpc("get_trial_settings");
    const trialDaysDefault = Math.max(
      1,
      Number((settings as { trial_days_default?: number })?.trial_days_default) || 15,
    );

    const today = ymdInTz(new Date(), TIME_ZONE);
    const dayByStartDate = new Map<string, SchedulerReminderDay>();
    for (const day of SCHEDULER_REMINDER_DAYS) {
      dayByStartDate.set(addDaysYmd(today, -day), day);
    }

    const { data: subsData, error: subsError } = await supabaseAdmin
      .from("company_subscriptions")
      .select(
        "id, company_id, trial_started_at, trial_ends_at, status, is_trial, subscription_plans(name), companies(name, company_email)",
      )
      .not("trial_started_at", "is", null)
      .in("status", ["trial", "expired"])
      .limit(limit);

    if (subsError) {
      console.error("[trial-reminder-scheduler] erro ao buscar trials:", subsError);
      return jsonResponse({ success: false, error: subsError.message }, 200);
    }

    const subs = (subsData || []) as TrialSubscriptionRow[];
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of subs) {
      const startYmd = ymdInTz(new Date(sub.trial_started_at), TIME_ZONE);
      const day = dayByStartDate.get(startYmd);
      if (day === undefined) {
        continue;
      }

      if (day < 15 && (sub.status !== "trial" || !sub.is_trial)) {
        skipped++;
        continue;
      }

      if (day === 15 && sub.status === "active") {
        skipped++;
        continue;
      }

      const company = Array.isArray(sub.companies) ? sub.companies[0] : sub.companies;
      const plan = Array.isArray(sub.subscription_plans) ? sub.subscription_plans[0] : sub.subscription_plans;
      const toEmail = String(company?.company_email || "").trim();

      if (!toEmail) {
        skipped++;
        continue;
      }

      const result = await sendAndLogTrialReminder(supabaseAdmin, RESEND_API_KEY, {
        companyId: sub.company_id,
        subscriptionId: sub.id,
        toEmail,
        day,
        companyName: company?.name || "Cliente",
        planName: plan?.name ?? null,
        trialDays: trialDaysDefault,
        trialEndsAt: sub.trial_ends_at,
      });

      if (result.skipped) skipped++;
      else if (result.sent) sent++;
      else failed++;
    }

    return jsonResponse({ success: true, today, processed: subs.length, sent, skipped, failed }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[trial-reminder-scheduler] Uncaught:", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
