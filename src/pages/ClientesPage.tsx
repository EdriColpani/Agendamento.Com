import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getStatusColor, createButton } from '@/lib/dashboard-utils';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showOperationError, showSuccess } from '@/utils/toast'; // Importar showSuccess
import { invokeEdgeWithAuthOrThrow } from '@/utils/edge-invoke';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Edit, MailCheck } from 'lucide-react'; // Importar o ícone MailCheck

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string; // Adicionar email para o reenvio
  status: string;
  points: number;
  // Adicione outros campos se precisar exibi-los, como email, birth_date, etc.
}

const ClientesPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null); // Estado para controlar o loading do reenvio

  const fetchClients = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany) {
      return; // Aguarda a sessão e a empresa primária carregarem
    }

    if (!session?.user) {
      setClients([]);
      setLoadingClients(false);
      return;
    }

    if (!primaryCompanyId) {
      setClients([]);
      setLoadingClients(false);
      return;
    }

    setLoadingClients(true);
    // AGORA FILTRANDO EXPLICITAMENTE PELA EMPRESA PRIMÁRIA
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, phone, email, status, points') // Incluir email
      .eq('company_id', primaryCompanyId) // Filtro adicionado
      .order('name', { ascending: true });

    if (error) {
      showOperationError('Erro ao carregar clientes.', error);
      console.error('Error fetching clients:', error);
      setClients([]);
    } else if (data) {
      setClients(data as Client[]);
    }
    setLoadingClients(false);
  }, [session, primaryCompanyId, sessionLoading, loadingPrimaryCompany]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleResendInvite = async (client: Client) => {
    if (!session?.user || !primaryCompanyId) {
      showError('Erro de autenticação ou empresa primária não encontrada.');
      return;
    }

    setResendingInviteId(client.id);
    try {
      await invokeEdgeWithAuthOrThrow('resend-client-invite', {
        body: {
          clientEmail: client.email,
          companyId: primaryCompanyId,
        },
      });

      showSuccess(`Convite reenviado para ${client.email} com sucesso!`);
    } catch (error: any) {
      console.error('Erro ao reenviar convite:', error);
      showOperationError('Erro ao reenviar convite.', error);
    } finally {
      setResendingInviteId(null);
    }
  };

  if (sessionLoading || loadingPrimaryCompany || loadingClients) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando clientes...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado para ver os clientes.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para gerenciar clientes.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/register-company')}
        >
          <i className="fas fa-building mr-2"></i>
          Cadastrar Empresa
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
        {createButton(() => navigate('/novo-cliente'), 'fas fa-user-plus', 'Cadastrar Cliente')}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:gap-4">
        <div className="flex-1">
          <Input
            placeholder="Buscar cliente..."
            className="border-gray-300 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {createButton(() => {}, 'fas fa-filter', 'Filtros', 'outline')}
      </div>

      <div className="grid gap-4">
        {filteredClients.length === 0 ? (
          <p className="text-gray-600">Nenhum cliente encontrado para sua empresa. Cadastre um novo cliente para começar!</p>
        ) : (
          filteredClients.map((cliente) => (
            <Card key={cliente.id} className="border-gray-200 cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 w-1/2">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-gray-200 text-gray-700">
                        {cliente.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-gray-900">{cliente.name}</h3>
                      <p className="text-sm text-gray-600">{cliente.phone ? `(${cliente.phone.substring(0,2)}) ${cliente.phone.substring(2,7)}-${cliente.phone.substring(7)}` : 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2"> {/* Adicionado flex para alinhar pontos e botões */}
                    <div className="text-center">
                      <p className="text-sm text-primary">{cliente.points} pontos</p>
                    </div>
                    <Badge className={`${getStatusColor(cliente.status)} text-xs`}>
                      {cliente.status.toUpperCase()}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!rounded-button whitespace-nowrap"
                      onClick={(e) => {
                        e.stopPropagation(); // Evita que o clique no botão acione o clique no card (se houver)
                        navigate(`/clientes/edit/${cliente.id}`);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!rounded-button whitespace-nowrap"
                      onClick={(e) => {
                        e.stopPropagation(); // Evita que o clique no botão acione o clique no card
                        handleResendInvite(cliente);
                      }}
                      disabled={resendingInviteId === cliente.id} // Desabilita durante o reenvio
                    >
                      {resendingInviteId === cliente.id ? (
                        <i className="fas fa-spinner fa-spin h-4 w-4"></i> // Ícone de loading
                      ) : (
                        <MailCheck className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {/* ... (seu modal de exclusão de cliente, se houver) */}
    </div>
  );
};

export default ClientesPage;