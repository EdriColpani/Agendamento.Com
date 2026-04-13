import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrimaryCompany } from './usePrimaryCompany';

interface CollaboratorLimitInfo {
  currentCount: number;
  maxAllowed: number | null; // null = ilimitado
  limitReached: boolean;
  nearLimit: boolean; // 80% ou mais do limite
  percentage: number; // 0-100
  loading: boolean;
}

export function useCollaboratorLimit(): CollaboratorLimitInfo {
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [limitInfo, setLimitInfo] = useState<CollaboratorLimitInfo>({
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
        console.warn('useCollaboratorLimit: Erro ao buscar assinatura:', subError);
        setLimitInfo(prev => ({ ...prev, loading: false }));
        return;
      }

      let maxAllowed: number | null = null;

      if (subscriptionData?.plan_id) {
        // 2. Buscar limite de colaboradores do plano
        const { data: limitData, error: limitError } = await supabase
          .from('plan_limits')
          .select('limit_value')
          .eq('plan_id', subscriptionData.plan_id)
          .eq('limit_type', 'collaborators')
          .maybeSingle();

        if (limitError && limitError.code !== 'PGRST116') {
          console.warn('useCollaboratorLimit: Erro ao buscar limite:', limitError);
        } else if (limitData && limitData.limit_value > 0) {
          maxAllowed = limitData.limit_value;
        }
      }

      // 3. Contar colaboradores ativos
      const { count, error: countError } = await supabase
        .from('collaborators')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', primaryCompanyId)
        .eq('is_active', true)
        .eq('is_arena_system_placeholder', false);

      if (countError) {
        console.warn('useCollaboratorLimit: Erro ao contar colaboradores:', countError);
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
      console.error('useCollaboratorLimit: Erro ao buscar informações de limite:', error);
      setLimitInfo(prev => ({ ...prev, loading: false }));
    }
  }, [primaryCompanyId, loadingPrimaryCompany]);

  useEffect(() => {
    fetchLimitInfo();
  }, [fetchLimitInfo]);

  return limitInfo;
}

