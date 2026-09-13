/** Status de assinatura que concedem acesso ao plano (pago ou trial ativo). */
export const EFFECTIVE_SUBSCRIPTION_STATUSES = ['active', 'trial'] as const;

export type EffectiveSubscriptionStatus = (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number];

export function isTrialSubscriptionActive(row: {
  status?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
}): boolean {
  if (row.status !== 'trial' || !row.is_trial || !row.trial_ends_at) return false;
  return new Date(row.trial_ends_at).getTime() > Date.now();
}

export function isEffectiveSubscription(row: {
  status?: string | null;
  end_date?: string | null;
  is_trial?: boolean | null;
  trial_ends_at?: string | null;
}): boolean {
  if (row.status === 'active') {
    if (!row.end_date) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(row.end_date);
    end.setHours(0, 0, 0, 0);
    return end >= today;
  }
  return isTrialSubscriptionActive(row);
}

export interface EffectiveSubscriptionRow {
  plan_id: string;
  status: string;
  end_date: string | null;
  is_trial: boolean | null;
  trial_ends_at: string | null;
  trial_started_at?: string | null;
}

/**
 * Busca assinatura vigente (active ou trial não expirado) da empresa.
 */
export async function fetchEffectiveSubscription(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (col: string, val: string) => {
          in: (col: string, vals: readonly string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{
                data: EffectiveSubscriptionRow[] | null;
                error: { code?: string; message?: string } | null;
              }>;
            };
          };
        };
      };
    };
  },
  companyId: string,
): Promise<EffectiveSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('company_subscriptions')
    .select('plan_id, status, end_date, is_trial, trial_ends_at, trial_started_at')
    .eq('company_id', companyId)
    .in('status', [...EFFECTIVE_SUBSCRIPTION_STATUSES])
    .order('start_date', { ascending: false })
    .limit(5);

  if (error) {
    throw error;
  }

  return (data ?? []).find(isEffectiveSubscription) ?? null;
}
