import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  readCompanyDetailsCache,
  writeCompanyDetailsCache,
  type CachedCompanyDetails,
} from '@/hooks/companyDataCache';

export type CompanyDetails = CachedCompanyDetails;

export const useCompanyDetails = (companyId: string | null) => {
  const cached = readCompanyDetailsCache(companyId);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(cached);
  const [loading, setLoading] = useState(() => !!companyId && !cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setCompanyDetails(null);
      setLoading(false);
      return;
    }

    const cachedDetails = readCompanyDetailsCache(companyId);
    if (cachedDetails) {
      setCompanyDetails(cachedDetails);
      setLoading(false);
      return;
    }

    const fetchCompanyDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('id, name, whatsapp_messaging_enabled, court_booking_enabled, court_enable_monthly_packages, tournament_enabled')
          .eq('id', companyId)
          .single();

        if (fetchError) {
          throw fetchError;
        }
        setCompanyDetails(data);
        writeCompanyDetailsCache(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar detalhes da empresa.';
        setError(message);
        console.error('Erro ao carregar detalhes da empresa:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyDetails();
  }, [companyId]);

  return { companyDetails, loading, error };
};
