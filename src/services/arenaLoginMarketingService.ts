import { supabase } from '@/integrations/supabase/client';

export type ArenaLoginMarketingRow = {
  id: number;
  image_url_1: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  image_url_4: string | null;
  updated_at: string;
};

/** Leitura pública (RLS: qualquer um) — usado na página /arena sem login. */
export async function fetchArenaLoginMarketingPublic(): Promise<ArenaLoginMarketingRow | null> {
  const { data, error } = await supabase
    .from('arena_login_marketing_config')
    .select('id, image_url_1, image_url_2, image_url_3, image_url_4, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('fetchArenaLoginMarketingPublic', error);
    return null;
  }
  return data as ArenaLoginMarketingRow | null;
}

export async function updateArenaLoginMarketingUrls(
  updates: Partial<
    Pick<ArenaLoginMarketingRow, 'image_url_1' | 'image_url_2' | 'image_url_3' | 'image_url_4'>
  >,
): Promise<void> {
  const { error } = await supabase.from('arena_login_marketing_config').update(updates).eq('id', 1);
  if (error) throw error;
}

const SLOT_KEYS = ['image_url_1', 'image_url_2', 'image_url_3', 'image_url_4'] as const;

export async function uploadArenaLoginMarketingSlot(slot: 1 | 2 | 3 | 4, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const path = `slot-${slot}-${Date.now()}.${safeExt}`;
  const { error: upErr } = await supabase.storage.from('arena-login-marketing').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
  });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('arena-login-marketing').getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const col = SLOT_KEYS[slot - 1];
  await updateArenaLoginMarketingUrls({ [col]: publicUrl } as Partial<
    Pick<ArenaLoginMarketingRow, 'image_url_1' | 'image_url_2' | 'image_url_3' | 'image_url_4'>
  >);

  return publicUrl;
}

export async function clearArenaLoginMarketingSlot(slot: 1 | 2 | 3 | 4): Promise<void> {
  const col = SLOT_KEYS[slot - 1];
  await updateArenaLoginMarketingUrls({ [col]: null } as Partial<
    Pick<ArenaLoginMarketingRow, 'image_url_1' | 'image_url_2' | 'image_url_3' | 'image_url_4'>
  >);
}
