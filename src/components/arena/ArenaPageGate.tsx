import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAppCompany } from '@/components/AppCompanyContext';
import ArenaPageLoading from '@/components/arena/ArenaPageLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ArenaPageGateProps {
  children: React.ReactNode;
}

/**
 * Validações comuns das páginas arena. Loading só na área de conteúdo — nunca tela cheia.
 */
const ArenaPageGate: React.FC<ArenaPageGateProps> = ({ children }) => {
  const navigate = useNavigate();
  const { primaryCompanyId, isCourtMode, canUseArenaManagement, shellReady } = useAppCompany();

  if (!shellReady) {
    return <ArenaPageLoading />;
  }

  if (!primaryCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <p className="text-gray-700 mb-4 text-center">
          É necessário ter uma empresa primária para acessar o módulo de quadras.
        </p>
        <Button onClick={() => navigate('/register-company')}>Cadastrar empresa</Button>
      </div>
    );
  }

  if (!isCourtMode) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!canUseArenaManagement) {
    return (
      <div className="flex items-center justify-center py-12 px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Módulo de quadras indisponível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <p>
              O módulo de reserva de quadras não está habilitado para o seu plano ou foi desativado na
              empresa.
            </p>
            <Button asChild variant="outline">
              <Link to="/planos">Ver planos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default ArenaPageGate;
