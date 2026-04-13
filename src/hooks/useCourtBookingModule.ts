import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCompanyDetails } from '@/hooks/useCompanyDetails';

/**
 * Gestão de quadras no app: exige segmento court + flag court_booking_enabled (plano / sync).
 * Reserva pública segue a mesma regra no backend (company_public_court_booking_allowed).
 */
export function useCourtBookingModule(companyId: string | null) {
  const { isCourtMode, loading: loadingMode } = useCompanySchedulingMode(companyId);
  const { companyDetails, loading: loadingCompany } = useCompanyDetails(companyId);

  const courtBookingEnabled = companyDetails?.court_booking_enabled === true;
  const loading = loadingMode || loadingCompany;
  const canUseArenaManagement = !loading && isCourtMode && courtBookingEnabled;

  return {
    canUseArenaManagement,
    isCourtMode,
    courtBookingEnabled,
    loading,
    /** Reaproveite no layout para evitar segundo SELECT em companies (ex.: WhatsApp). */
    companyDetails,
  };
}
