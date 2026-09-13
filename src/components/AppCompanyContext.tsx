import React, { createContext, useContext } from 'react';
import type { CachedCompanyDetails } from '@/hooks/companyDataCache';

export interface AppCompanyContextValue {
  primaryCompanyId: string | null;
  primaryCompanyName: string | null;
  isCourtMode: boolean;
  canUseArenaManagement: boolean;
  canShowTournamentMenu: boolean;
  companyDetails: CachedCompanyDetails | null;
  /** Shell pronto: empresa e módulos já resolvidos (ou usuário sem empresa). */
  shellReady: boolean;
}

const AppCompanyContext = createContext<AppCompanyContextValue | undefined>(undefined);

export function AppCompanyProvider({
  value,
  children,
}: {
  value: AppCompanyContextValue;
  children: React.ReactNode;
}) {
  return <AppCompanyContext.Provider value={value}>{children}</AppCompanyContext.Provider>;
}

export function useAppCompany(): AppCompanyContextValue {
  const ctx = useContext(AppCompanyContext);
  if (!ctx) {
    throw new Error('useAppCompany deve ser usado dentro de AppCompanyProvider (MainApplication).');
  }
  return ctx;
}

/** Versão segura para páginas que podem renderizar fora do provider (fallback nos hooks antigos). */
export function useAppCompanyOptional(): AppCompanyContextValue | null {
  return useContext(AppCompanyContext) ?? null;
}
