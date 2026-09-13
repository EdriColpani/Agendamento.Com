import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from './usePrimaryCompany';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { isBefore, parseISO, differenceInDays, startOfDay } from 'date-fns';

export type SubscriptionStatus =
  | 'loading'
  | 'active'
  | 'trial'
  | 'expired'
  | 'expiring_soon'
  | 'no_subscription';

export type SubscriptionAccessType =
  | 'active'
  | 'trial'
  | 'trial_expired'
  | 'none'
  | 'unknown';

interface SubscriptionStatusResult {
  status: SubscriptionStatus;
  endDate: string | null;
  trialDaysRemaining: number | null;
  isTrial: boolean;
  planId: string | null;
  accessType: SubscriptionAccessType;
  loading: boolean;
  refresh: () => void;
}

const EXPIRING_THRESHOLD_DAYS = 3;

interface SubscriptionAccessRpc {
  has_access?: boolean;
  access_type?: string;
  end_date?: string | null;
  trial_ends_at?: string | null;
  trial_days_remaining?: number | null;
  plan_id?: string | null;
  status?: string | null;
}

function normalizeAccessType(value?: string): SubscriptionAccessType {
  if (value === 'active' || value === 'trial' || value === 'trial_expired' || value === 'none') {
    return value;
  }
  return 'unknown';
}

export function useSubscriptionStatus(): SubscriptionStatusResult {
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [accessType, setAccessType] = useState<SubscriptionAccessType>('unknown');
  const [loading, setLoading] = useState(true);
  const hasLoadedSubscriptionRef = useRef(false);

  const checkSubscription = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany) {
      return;
    }

    if (!session?.user || !primaryCompanyId) {
      setStatus('no_subscription');
      setEndDate(null);
      setTrialDaysRemaining(null);
      setIsTrial(false);
      setPlanId(null);
      setAccessType('none');
      setLoading(false);
      return;
    }

    if (!hasLoadedSubscriptionRef.current) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase.rpc('get_company_subscription_access', {
        p_company_id: primaryCompanyId,
      });

      if (error) {
        throw error;
      }

      const access = (data ?? {}) as SubscriptionAccessRpc;
      const normalizedAccess = normalizeAccessType(access.access_type);
      setAccessType(normalizedAccess);
      setPlanId(typeof access.plan_id === 'string' ? access.plan_id : null);

      if (access.has_access && access.access_type === 'trial') {
        setIsTrial(true);
        setEndDate(access.trial_ends_at ?? null);
        setTrialDaysRemaining(
          typeof access.trial_days_remaining === 'number' ? access.trial_days_remaining : null,
        );
        const daysLeft = access.trial_days_remaining ?? EXPIRING_THRESHOLD_DAYS + 1;
        setStatus(daysLeft <= EXPIRING_THRESHOLD_DAYS ? 'expiring_soon' : 'trial');
        return;
      }

      if (access.has_access && access.access_type === 'active') {
        setIsTrial(false);
        const endDateISO = access.end_date ?? null;
        setEndDate(endDateISO);
        setTrialDaysRemaining(null);

        if (!endDateISO) {
          setStatus('active');
          return;
        }

        const today = startOfDay(new Date());
        const expirationDate = startOfDay(parseISO(endDateISO));

        if (isBefore(expirationDate, today)) {
          setStatus('expired');
        } else {
          const daysUntilExpiration = differenceInDays(expirationDate, today);
          setStatus(daysUntilExpiration <= EXPIRING_THRESHOLD_DAYS ? 'expiring_soon' : 'active');
        }
        return;
      }

      if (access.access_type === 'trial_expired') {
        setIsTrial(true);
        setStatus('expired');
        setEndDate(access.trial_ends_at ?? null);
        setTrialDaysRemaining(0);
        return;
      }

      setIsTrial(false);
      setStatus('no_subscription');
      setEndDate(null);
      setTrialDaysRemaining(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Error checking subscription status:', error);
      showError('Erro ao verificar status da assinatura: ' + message);
      setStatus('no_subscription');
      setIsTrial(false);
      setAccessType('unknown');
    } finally {
      hasLoadedSubscriptionRef.current = true;
      setLoading(false);
    }
  }, [session, sessionLoading, loadingPrimaryCompany, primaryCompanyId]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  return {
    status,
    endDate,
    trialDaysRemaining,
    isTrial,
    planId,
    accessType,
    loading,
    refresh: checkSubscription,
  };
}
