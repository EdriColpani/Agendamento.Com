export const ARENA_REGISTER_PROFESSIONAL_URL = '/register-professional?modo=arena';
export const ARENA_REGISTER_COMPANY_URL = '/register-company?modo=arena';
export const ARENA_REGISTRATION_STORAGE_KEY = 'planoagenda.cadastro-modo-arena';

export type SegmentOptionWithMode = {
  id: string;
  name: string;
  area_name: string;
  scheduling_mode?: string | null;
};

export function persistArenaRegistrationIntent(): void {
  try {
    sessionStorage.setItem(ARENA_REGISTRATION_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearArenaRegistrationIntent(): void {
  try {
    sessionStorage.removeItem(ARENA_REGISTRATION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** URL de cadastro conforme sessão (profissional novo vs. empresa adicional). */
export function getArenaRegistrationUrl(isLoggedIn: boolean): string {
  return isLoggedIn ? ARENA_REGISTER_COMPANY_URL : ARENA_REGISTER_PROFESSIONAL_URL;
}

export function resolveArenaRegistrationMode(searchParams: URLSearchParams): boolean {
  if (searchParams.get('modo') === 'arena') {
    persistArenaRegistrationIntent();
    return true;
  }
  try {
    return sessionStorage.getItem(ARENA_REGISTRATION_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function getCourtSegmentOptions<T extends SegmentOptionWithMode>(options: T[]): T[] {
  return options.filter((option) => option.scheduling_mode === 'court');
}

export function pickDefaultCourtSegmentId<T extends SegmentOptionWithMode>(options: T[]): string | null {
  const courtSegments = getCourtSegmentOptions(options);
  if (courtSegments.length === 0) return null;
  return courtSegments[0].id;
}
