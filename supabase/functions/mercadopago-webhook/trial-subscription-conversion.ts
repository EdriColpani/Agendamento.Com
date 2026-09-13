export type ConvertibleTrialRow = {
  id: string;
  status: string;
  plan_id: string;
  trial_ends_at: string | null;
};

type SupabaseAdminLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, val: string) => {
        not: (col: string, op: string, val: null) => {
          in: (col: string, vals: string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: ConvertibleTrialRow | null;
                  error: { code?: string; message?: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
};

/** Cópia colocal — manter alinhada com apply-coupon-and-subscribe/trial-subscription-conversion.ts */
export async function findConvertibleTrialSubscription(
  supabaseAdmin: SupabaseAdminLike,
  companyId: string,
): Promise<ConvertibleTrialRow | null> {
  const { data, error } = await supabaseAdmin
    .from("company_subscriptions")
    .select("id, status, plan_id, trial_ends_at")
    .eq("company_id", companyId)
    .not("trial_ends_at", "is", null)
    .in("status", ["trial", "expired"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data;
}

export function buildPaidActiveSubscriptionUpdate(params: {
  planId: string;
  startDate: string;
  finalEndDate: string;
  billingCycleStart: string;
}) {
  return {
    plan_id: params.planId,
    start_date: params.startDate,
    end_date: params.finalEndDate,
    billing_cycle_start: params.billingCycleStart,
    billing_cycle_end: params.finalEndDate,
    status: "active",
    is_trial: false,
    trial_started_at: null,
    trial_ends_at: null,
  };
}

export function buildPendingCheckoutUpdate(params: { planId: string; startDate: string }) {
  return {
    plan_id: params.planId,
    status: "pending",
    start_date: params.startDate,
    end_date: null,
    billing_cycle_start: params.startDate,
    billing_cycle_end: null,
  };
}

export async function logTrialConversion(
  supabaseAdmin: {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
  },
  params: {
    companyId: string;
    subscriptionId: string;
    planId: string;
    source: string;
    paymentAttemptId?: string | null;
  },
) {
  try {
    const { error } = await supabaseAdmin.rpc("log_trial_conversion", {
      p_company_id: params.companyId,
      p_subscription_id: params.subscriptionId,
      p_plan_id: params.planId,
      p_source: params.source,
      p_payment_attempt_id: params.paymentAttemptId ?? null,
    });
    if (error) {
      console.error("log_trial_conversion failed (non-critical):", error.message);
    }
  } catch (err: unknown) {
    console.error("log_trial_conversion failed (non-critical):", err);
  }
}
