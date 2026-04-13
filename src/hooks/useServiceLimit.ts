import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrimaryCompany } from './usePrimaryCompany';

interface ServiceLimitInfo {
  currentCount: number;
  maxAllowed: number | null; // null = ilimitado
  limitReached: boolean;
  nearLimit: boolean; // 80% ou mais do limite
  percentage: number; // 0-100
  loading: boolean;
}

export function useServiceLimit(): ServiceLimitInfo {
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [limitInfo, setLimitInfo] = useState<ServiceLimitInfo>({
    currentCount: 0,
    maxAllowed: null,
    limitReached: false,
    nearLimit: false,
    percentage: 0,
    loading: true,
  });

  const fetchLimitInfo = useCallback(async () => {
    if (loadingPrimaryCompany || !primaryCompanyId) {
      setLimitInfo(prev => ({ ...prev, loading: true }));
      return;
    }

    try {
      // 1. Buscar plano ativo da empresa
      const { data: subscriptionData, error: subError } = await supabase
        .from('company_subscriptions')
        .select('plan_id')
        .eq('company_id', primaryCompanyId)
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError && subError.code !== 'PGRST116') {
        console.warn('useServiceLimit: Erro ao buscar assinatura:', subError);
        setLimitInfo(prev => ({ ...prev, loading: false }));
        return;
      }

      let maxAllowed: number | null = null;

      if (subscriptionData?.plan_id) {
        // 2. Buscar limite de serviços do plano
        const { data: limitData, error: limitError } = await supabase
          .from('plan_limits')
          .select('limit_value')
          .eq('plan_id', subscriptionData.plan_id)
          .eq('limit_type', 'services')
          .maybeSingle();

        if (limitError && limitError.code !== 'PGRST116') {
          console.warn('useServiceLimit: Erro ao buscar limite:', limitError);
        } else if (limitData && limitData.limit_value > 0) {
          maxAllowed = limitData.limit_value;
        }
      }

      // 3. Contar serviços ativos (status = 'Ativo')
      const { count, error: countError } = await supabase
        .from('services')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', primaryCompanyId)
        .eq('status', 'Ativo')
        .eq('is_arena_system_service_placeholder', false);

      if (countError) {
        console.warn('useServiceLimit: Erro ao contar serviços:', countError);
        setLimitInfo(prev => ({ ...prev, loading: false }));
        return;
      }

      const currentCount = count || 0;

      // 4. Calcular porcentagem e status
      let percentage = 0;
      let limitReached = false;
      let nearLimit = false;

      if (maxAllowed !== null && maxAllowed > 0) {
        percentage = Math.round((currentCount / maxAllowed) * 100);
        limitReached = currentCount >= maxAllowed;
        nearLimit = percentage >= 80 && !limitReached;
      }

      setLimitInfo({
        currentCount,
        maxAllowed,
        limitReached,
        nearLimit,
        percentage,
        loading: false,
      });
    } catch (error: any) {
      console.error('useServiceLimit: Erro ao buscar informações de limite:', error);
      setLimitInfo(prev => ({ ...prev, loading: false }));
    }
  }, [primaryCompanyId, loadingPrimaryCompany]);

  useEffect(() => {
    fetchLimitInfo();
  }, [fetchLimitInfo]);

  return limitInfo;
}

