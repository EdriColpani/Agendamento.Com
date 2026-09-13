import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TrialSettings {
  trial_enabled: boolean;
  trial_days_default: number;
}

const DEFAULT_TRIAL_SETTINGS: TrialSettings = {
  trial_enabled: false,
  trial_days_default: 15,
};

export function useTrialSettings() {
  const [settings, setSettings] = useState<TrialSettings>(DEFAULT_TRIAL_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_trial_settings');
      if (error) throw error;
      if (data && typeof data === 'object') {
        const row = data as { trial_enabled?: boolean; trial_days_default?: number };
        setSettings({
          trial_enabled: !!row.trial_enabled,
          trial_days_default: row.trial_days_default ?? 15,
        });
      } else {
        setSettings(DEFAULT_TRIAL_SETTINGS);
      }
    } catch (error) {
      console.warn('[useTrialSettings] Erro ao carregar configuração de trial:', error);
      setSettings(DEFAULT_TRIAL_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  return { ...settings, loading };
}
