import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import ContractList from '@/components/ContractList';
import { useSession } from '@/components/SessionContextProvider';
import { showError } from '@/utils/toast';

const ContractManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para gerenciar contratos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Contratos</h1>
      </div>

      <div className="max-w-4xl space-y-6">
        <Card className="border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-gray-900">Modelos de Contrato</CardTitle>
            <Button
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate('/admin-dashboard/new-contract')}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo Contrato
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <ContractList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ContractManagementPage;