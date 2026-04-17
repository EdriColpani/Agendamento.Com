import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CompanyDetails {
  id: string;
  name: string;
  whatsapp_messaging_enabled: boolean;
  court_booking_enabled?: boolean;
  court_enable_monthly_packages?: boolean;
}

export const useCompanyDetails = (companyId: string | null) => {
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setCompanyDetails(null);
      setLoading(false);
      return;
    }

    const fetchCompanyDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name, whatsapp_messaging_enabled, court_booking_enabled, court_enable_monthly_packages')
          .eq('id', companyId)
          .single();

        if (error) {
          throw error;
        }
        setCompanyDetails(data);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar detalhes da empresa.');
        console.error('Erro ao carregar detalhes da empresa:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyDetails();
  }, [companyId]);

  return { companyDetails, loading, error };
};

