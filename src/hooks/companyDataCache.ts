export type CompanySchedulingMode = 'service' | 'court';

export interface CachedCompanyDetails {
  id: string;
  name: string;
  whatsapp_messaging_enabled: boolean;
  court_booking_enabled?: boolean;
  court_enable_monthly_packages?: boolean;
  tournament_enabled?: boolean;
}

type PrimaryCompanyCache = {
  userId: string | null;
  companyId: string | null;
  companyName: string | null;
  ready: boolean;
};

const primaryCompanyCache: PrimaryCompanyCache = {
  userId: null,
  companyId: null,
  companyName: null,
  ready: false,
};

const companyDetailsCache = new Map<string, CachedCompanyDetails>();
const schedulingModeCache = new Map<string, CompanySchedulingMode>();

export function isPrimaryCompanyCacheReady(userId: string | null): boolean {
  return userId != null && primaryCompanyCache.userId === userId && primaryCompanyCache.ready;
}

export function readPrimaryCompanyCache(userId: string | null) {
  if (!isPrimaryCompanyCacheReady(userId)) {
    return { companyId: null as string | null, companyName: null as string | null };
  }
  return {
    companyId: primaryCompanyCache.companyId,
    companyName: primaryCompanyCache.companyName,
  };
}

export function writePrimaryCompanyCache(
  userId: string,
  companyId: string | null,
  companyName: string | null,
) {
  primaryCompanyCache.userId = userId;
  primaryCompanyCache.companyId = companyId;
  primaryCompanyCache.companyName = companyName;
  primaryCompanyCache.ready = true;
}

export function clearPrimaryCompanyCacheForUser(userId: string | null) {
  if (userId == null || primaryCompanyCache.userId === userId) {
    primaryCompanyCache.userId = null;
    primaryCompanyCache.companyId = null;
    primaryCompanyCache.companyName = null;
    primaryCompanyCache.ready = false;
  }
}

export function readCompanyDetailsCache(companyId: string | null): CachedCompanyDetails | null {
  if (!companyId) return null;
  return companyDetailsCache.get(companyId) ?? null;
}

export function writeCompanyDetailsCache(details: CachedCompanyDetails) {
  companyDetailsCache.set(details.id, details);
}

export function readSchedulingModeCache(companyId: string | null): CompanySchedulingMode | null {
  if (!companyId) return null;
  return schedulingModeCache.get(companyId) ?? null;
}

export function writeSchedulingModeCache(companyId: string, mode: CompanySchedulingMode) {
  schedulingModeCache.set(companyId, mode);
}
