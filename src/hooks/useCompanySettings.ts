import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { usePrimaryCompany } from './usePrimaryCompany';

interface CompanySettings {
  require_client_registration: boolean;
  guest_appointment_link: string | null;
  public_court_allow_counter_payment: boolean;
  court_enable_monthly_packages: boolean;
}

export function useCompanySettings() {
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (loadingPrimaryCompany || !primaryCompanyId) {
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('require_client_registration, guest_appointment_link, public_court_allow_counter_payment, court_enable_monthly_packages')
        .eq('id', primaryCompanyId)
        .single();

      if (error) {
        throw error;
      }

      setSettings(data as CompanySettings);
    } catch (error: any) {
      console.error('Error fetching company settings:', error);
      showError('Erro ao carregar configurações da empresa: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId, loadingPrimaryCompany]);

  useEffect(() => {
    if (session?.user && primaryCompanyId) {
      fetchSettings();
    }
  }, [session, primaryCompanyId, fetchSettings]);

  const updateSettings = useCallback(async (newSettings: Partial<CompanySettings>) => {
    if (!primaryCompanyId) {
      showError('ID da empresa primária não encontrado.');
      return false;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update(newSettings)
        .eq('id', primaryCompanyId);

      if (error) {
        throw error;
      }

      setSettings(prev => ({ ...prev, ...newSettings } as CompanySettings));
      showSuccess('Configurações atualizadas com sucesso!');
      return true;
    } catch (error: any) {
      console.error('Error updating company settings:', error);
      showError('Erro ao atualizar configurações da empresa: ' + error.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [primaryCompanyId]);

  return {
    settings,
    loading,
    isSaving,
    fetchSettings,
    updateSettings,
  };
}






