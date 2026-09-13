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
  const [canCreateRpc, setCanCreateRpc] = useState(false);
  const [loadingRpc, setLoadingRpc] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!primaryCompanyId) {
        setCanCreateRpc(false);
        setLoadingRpc(false);
        return;
      }
      setLoadingRpc(true);
      const createRes = await supabase.rpc('company_can_create_tournament', {
        p_company_id: primaryCompanyId,
      });
      if (cancelled) return;
      setCanCreateRpc(!createRes.error && createRes.data === true);
      setLoadingRpc(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [primaryCompanyId, tournamentEnabled]);

  const loading = loadingPrimaryCompany || loadingArena || loadingRpc;
  /** Sidebar e rotas do módulo: somente com flag do plano (Plano Arena Full). */
  const canShowTournamentMenu = !loading && canUseArenaManagement && tournamentEnabled;
  const canUseTournament = canShowTournamentMenu;
  const canCreateTournament = canShowTournamentMenu && canCreateRpc;

  return {
    primaryCompanyId,
    canUseArenaManagement,
    tournamentEnabled,
    canShowTournamentMenu,
    canUseTournament,
    canCreateTournament,
    loading,
  };
}
