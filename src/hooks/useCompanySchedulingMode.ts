import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CompanySchedulingMode = 'service' | 'court';

interface SchedulingCache {
  companyId: string;
  mode: CompanySchedulingMode;
}

/**
 * Modo de agenda da empresa a partir do segmento vinculado (segment_types.scheduling_mode).
 * Usado para rotear UX (dashboard arena vs serviços) sem depender do nome do segmento.
 *
 * `loading` fica true enquanto não houver resultado para o **companyId atual** (evita flash
 * em que isCourtMode ainda é false após trocar de rota / remontar hooks).
 */
export function useCompanySchedulingMode(companyId: string | null) {
  const [cache, setCache] = useState<SchedulingCache | null>(null);

  useEffect(() => {
    if (!companyId) {
      setCache(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const { data: companyRow, error: companyError } = await supabase
          .from('companies')
          .select('segment_type')
          .eq('id', companyId)
          .maybeSingle();

        if (companyError || !companyRow?.segment_type) {
          if (!cancelled) setCache({ companyId, mode: 'service' });
          return;
        }

        const { data: segmentRow, error: segmentError } = await supabase
          .from('segment_types')
          .select('scheduling_mode')
          .eq('id', companyRow.segment_type)
          .maybeSingle();

        if (segmentError || !segmentRow) {
          if (!cancelled) setCache({ companyId, mode: 'service' });
          return;
        }

        const mode: CompanySchedulingMode =
          segmentRow.scheduling_mode === 'court' ? 'court' : 'service';
        if (!cancelled) setCache({ companyId, mode });
      } catch (e) {
        console.error('useCompanySchedulingMode:', e);
        if (!cancelled) setCache({ companyId, mode: 'service' });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const loading = companyId != null && (cache == null || cache.companyId !== companyId);
  const schedulingMode: CompanySchedulingMode =
    !companyId ? 'service' : cache?.companyId === companyId ? cache.mode : 'service';
  const isCourtMode = schedulingMode === 'court';

  return {
    schedulingMode,
    isCourtMode,
    loading,
  };
}
