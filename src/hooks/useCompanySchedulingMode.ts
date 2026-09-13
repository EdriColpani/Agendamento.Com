import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  readSchedulingModeCache,
  writeSchedulingModeCache,
  type CompanySchedulingMode,
} from '@/hooks/companyDataCache';

export type { CompanySchedulingMode };

interface SchedulingCache {
  companyId: string;
  mode: CompanySchedulingMode;
}

/**
 * Modo de agenda da empresa a partir do segmento vinculado (segment_types.scheduling_mode).
 */
export function useCompanySchedulingMode(companyId: string | null) {
  const cachedMode = readSchedulingModeCache(companyId);
  const [cache, setCache] = useState<SchedulingCache | null>(() =>
    companyId && cachedMode ? { companyId, mode: cachedMode } : null,
  );

  useEffect(() => {
    if (!companyId) {
      setCache(null);
      return;
    }

    const knownMode = readSchedulingModeCache(companyId);
    if (knownMode) {
      setCache({ companyId, mode: knownMode });
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
          if (!cancelled) {
            writeSchedulingModeCache(companyId, 'service');
            setCache({ companyId, mode: 'service' });
          }
          return;
        }

        const { data: segmentRow, error: segmentError } = await supabase
          .from('segment_types')
          .select('scheduling_mode')
          .eq('id', companyRow.segment_type)
          .maybeSingle();

        if (segmentError || !segmentRow) {
          if (!cancelled) {
            writeSchedulingModeCache(companyId, 'service');
            setCache({ companyId, mode: 'service' });
          }
          return;
        }

        const mode: CompanySchedulingMode =
          segmentRow.scheduling_mode === 'court' ? 'court' : 'service';
        if (!cancelled) {
          writeSchedulingModeCache(companyId, mode);
          setCache({ companyId, mode });
        }
      } catch (e) {
        console.error('useCompanySchedulingMode:', e);
        if (!cancelled) {
          writeSchedulingModeCache(companyId, 'service');
          setCache({ companyId, mode: 'service' });
        }
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
};
