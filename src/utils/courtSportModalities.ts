import { supabase } from '@/integrations/supabase/client';

export interface CourtSportModality {
  id: string;
  court_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export function activeCourtSportNames(modalities: CourtSportModality[] | string[] | null | undefined): string[] {
  if (!modalities?.length) return [];
  if (typeof modalities[0] === 'string') {
    return (modalities as string[]).map((n) => n.trim()).filter(Boolean);
  }
  return (modalities as CourtSportModality[])
    .filter((m) => m.is_active)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'pt-BR'))
    .map((m) => m.name);
}

/** Dropdown obrigatório apenas com 2+ modalidades ativas. */
export function courtSportRequiresSelection(modalities: CourtSportModality[] | string[] | null | undefined): boolean {
  return activeCourtSportNames(modalities).length >= 2;
}

/** Auto-preenche quando há exatamente uma modalidade. */
export function courtSportAutoValue(modalities: CourtSportModality[] | string[] | null | undefined): string | null {
  const names = activeCourtSportNames(modalities);
  return names.length === 1 ? names[0] : null;
}

export async function fetchCourtSportModalitiesByCourtIds(
  courtIds: string[],
): Promise<Record<string, CourtSportModality[]>> {
  if (!courtIds.length) return {};
  const { data, error } = await supabase
    .from('court_sport_modalities')
    .select('id, court_id, name, display_order, is_active')
    .in('court_id', courtIds)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  const map: Record<string, CourtSportModality[]> = {};
  for (const row of (data || []) as CourtSportModality[]) {
    if (!map[row.court_id]) map[row.court_id] = [];
    map[row.court_id].push(row);
  }
  return map;
}

export async function saveCourtSportModalities(
  courtId: string,
  names: string[],
): Promise<void> {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);

  const { data: existing, error: loadErr } = await supabase
    .from('court_sport_modalities')
    .select('id, name')
    .eq('court_id', courtId);

  if (loadErr) throw loadErr;

  const existingRows = (existing || []) as { id: string; name: string }[];
  const existingByLower = new Map(existingRows.map((r) => [r.name.toLowerCase(), r]));

  const keepIds = new Set<string>();
  for (let i = 0; i < trimmed.length; i++) {
    const name = trimmed[i];
    const found = existingByLower.get(name.toLowerCase());
    if (found) {
      keepIds.add(found.id);
      const { error: updErr } = await supabase
        .from('court_sport_modalities')
        .update({ name, display_order: i, is_active: true })
        .eq('id', found.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from('court_sport_modalities').insert({
        court_id: courtId,
        name,
        display_order: i,
        is_active: true,
      });
      if (insErr) throw insErr;
    }
  }

  const toDeactivate = existingRows.filter((r) => !keepIds.has(r.id));
  if (toDeactivate.length) {
    const { error: delErr } = await supabase
      .from('court_sport_modalities')
      .delete()
      .in(
        'id',
        toDeactivate.map((r) => r.id),
      );
    if (delErr) throw delErr;
  }
}
