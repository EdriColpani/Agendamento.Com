import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';

export function useTournamentAccess() {
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const {
    canUseArenaManagement,
    loading: loadingArena,
    companyDetails,
  } = useCourtBookingModule(primaryCompanyId);

  const tournamentEnabled = companyDetails?.tournament_enabled === true;
  const [hasAccessRpc, setHasAccessRpc] = useState(false);
  const [canCreateRpc, setCanCreateRpc] = useState(false);
  const [loadingRpc, setLoadingRpc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!primaryCompanyId) {
        setHasAccessRpc(false);
        setCanCreateRpc(false);
        setLoadingRpc(false);
        return;
      }
      setLoadingRpc(true);
      const [accessRes, createRes] = await Promise.all([
        supabase.rpc('company_has_tournament_access', {
          p_company_id: primaryCompanyId,
        }),
        supabase.rpc('company_can_create_tournament', {
          p_company_id: primaryCompanyId,
        }),
      ]);
      if (cancelled) return;
      setHasAccessRpc(!accessRes.error && accessRes.data === true);
      setCanCreateRpc(!createRes.error && createRes.data === true);
      setLoadingRpc(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [primaryCompanyId, tournamentEnabled]);

  const loading = loadingPrimaryCompany || loadingArena || loadingRpc;
  const canUseTournament = !loading && canUseArenaManagement && hasAccessRpc;
  const canCreateTournament = !loading && canUseArenaManagement && canCreateRpc;

  return {
    primaryCompanyId,
    canUseArenaManagement,
    tournamentEnabled,
    canUseTournament,
    canCreateTournament,
    loading,
  };
}
