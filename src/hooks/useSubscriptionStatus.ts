import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from './usePrimaryCompany';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { isBefore, parseISO, differenceInDays, startOfDay } from 'date-fns';

export type SubscriptionStatus = 'loading' | 'active' | 'expired' | 'expiring_soon' | 'no_subscription';

interface SubscriptionStatusResult {
  status: SubscriptionStatus;
  endDate: string | null;
  loading: boolean;
}

const EXPIRING_THRESHOLD_DAYS = 3;

export function useSubscriptionStatus(): SubscriptionStatusResult {
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany) {
      return;
    }

    if (!session?.user || !primaryCompanyId) {
      setStatus('no_subscription');
      setEndDate(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Primeiro, tentar buscar assinatura ativa
      // Usar maybeSingle() para evitar erro 406 quando não há assinatura
      let { data: subData, error } = await supabase
        .from('company_subscriptions')
        .select('end_date, status')
        .eq('company_id', primaryCompanyId)
        .eq('status', 'active')
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Se não encontrou ativa, buscar qualquer assinatura (pode estar pending ou outra)
      if (!subData && (!error || error.code === 'PGRST116')) {
        const { data: anySubData, error: anySubError } = await supabase
          .from('company_subscriptions')
          .select('end_date, status')
          .eq('company_id', primaryCompanyId)
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (anySubData) {
          subData = anySubData;
          error = anySubError;
        }
      }

      // Tratar erros específicos
      if (error) {
        // PGRST116 = "No rows found" (normal quando não há assinatura)
        if (error.code === 'PGRST116') {
          setStatus('no_subscription');
          setEndDate(null);
          setLoading(false);
          return;
        }
        
        // PGRST301 ou 406 = "Not Acceptable" (problema com RLS ou query)
        if (error.code === 'PGRST301' || error.status === 406) {
          // Tentar buscar sem filtro de status para diagnóstico
          const { data: allSubs, error: allSubsError } = await supabase
            .from('company_subscriptions')
            .select('id, company_id, plan_id, status, end_date')
            .eq('company_id', primaryCompanyId)
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (allSubsError && allSubsError.code !== 'PGRST116') {
            throw allSubsError;
          }
          
          if (!allSubs) {
            setStatus('no_subscription');
            setEndDate(null);
            setLoading(false);
            return;
          }
          
          // Se encontrou assinatura mas não está ativa, verificar se está expirada
          if (allSubs.end_date) {
            const today = startOfDay(new Date());
            const expirationDate = startOfDay(parseISO(allSubs.end_date));
            if (isBefore(expirationDate, today)) {
              setStatus('expired');
              setEndDate(allSubs.end_date);
              setLoading(false);
              return;
            }
          }
          
          setStatus('no_subscription');
          setEndDate(null);
          setLoading(false);
          return;
        }
        
        // Outros erros
        throw error;
      }

      if (!subData || !subData.end_date) {
        setStatus('no_subscription');
        setEndDate(null);
        return;
      }

      const endDateISO = subData.end_date;
      setEndDate(endDateISO);
      
      const today = startOfDay(new Date());
      const expirationDate = startOfDay(parseISO(endDateISO));
      
      if (isBefore(expirationDate, today)) {
        // If the end date is before today, it's expired
        setStatus('expired');
      } else {
        const daysUntilExpiration = differenceInDays(expirationDate, today);
        
        if (daysUntilExpiration <= EXPIRING_THRESHOLD_DAYS) {
          setStatus('expiring_soon');
        } else {
          setStatus('active');
        }
      }

    } catch (error: any) {
      console.error('Error checking subscription status:', error);
      showError('Erro ao verificar status da assinatura: ' + error.message);
      setStatus('no_subscription');
    } finally {
      setLoading(false);
    }
  }, [session, sessionLoading, loadingPrimaryCompany, primaryCompanyId]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  return { status, endDate, loading };
}