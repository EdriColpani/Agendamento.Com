import { supabase } from '@/integrations/supabase/client';

/**
 * `segment_types.scheduling_mode === 'court'` = Arena (quadras) no produto.
 * Deve bater com useCompanySchedulingMode / isSegmentCourtMode nas edge functions.
 */
export async function isSegmentCourtModeClient(
  segmentTypeId: string | null | undefined
): Promise<boolean> {
  if (!segmentTypeId) return false;
  const { data, error } = await supabase
    .from('segment_types')
    .select('scheduling_mode')
    .eq('id', segmentTypeId)
    .maybeSingle();
  if (error || !data) return false;
  return data.scheduling_mode === 'court';
}
