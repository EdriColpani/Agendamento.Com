import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { usePendingCommissions, PendingCommission } from '@/hooks/usePendingCommissions';
import { CommissionPaymentModal } from '@/components/CommissionPaymentModal';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Collaborator {
  id: string;
  name: string;
}

const CommissionPaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [selectedCommissions, setSelectedCommissions] = useState<PendingCommission[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { pendingCommissions, loading: loadingCommissions, refetch } = usePendingCommissions(
    selectedCollaboratorId,
    startDate,
    endDate
  );

  // Buscar lista de colaboradores
  useEffect(() => {
    const fetchCollaborators = async () => {
      if (!primaryCompanyId) return;

      try {
        const { data, error } = await supabase
          .from('collaborators')
          .select('id, first_name, last_name')
          .eq('company_id', primaryCompanyId)
          .eq('is_arena_system_placeholder', false)
          .order('first_name');

        if (error) throw error;

        setCollaborators(
          (data || []).map(c => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
          }))
        );
      } catch (error: any) {
        console.error('[CommissionPaymentPage] Erro ao buscar colaboradores:', error);
      }
    };

    fetchCollaborators();
  }, [primaryCompanyId]);

  const handleSelectCommission = (commission: PendingCommission) => {
    setSelectedCommissions(prev => {
      const exists = prev.find(c => c.id === commission.id);
      if (exists) {
        return prev.filter(c => c.id !== commission.id);
      }
      return [...prev, commission];
    });
  };

  const handleSelectAllFromCollaborator = (collaboratorId: string) => {
    const collaboratorData = pendingCommissions.find(c => c.collaborator_id === collaboratorId);
    if (!collaboratorData) return;

    const allSelected = collaboratorData.commissions.every(comm =>
      selectedCommissions.some(sel => sel.id === comm.id)
    );

    if (allSelected) {
      // Desmarcar todas deste colaborador
      setSelectedCommissions(prev =>
        prev.filter(comm => !collaboratorData.commissions.some(c => c.id === comm.id))
      );
    } else {
      // Marcar todas deste colaborador
      setSelectedCommissions(prev => {
        const newCommissions = collaboratorData.commissions.filter(
          comm => !prev.some(sel => sel.id === comm.id)
        );
        return [...prev, ...newCommissions];
      });
    }
  };

  const handleSelectAll = () => {
    const allCommissions = pendingCommissions.flatMap(c => c.commissions);
    const allSelected = allCommissions.every(comm =>
      selectedCommissions.some(sel => sel.id === comm.id)
    );

    if (allSelected) {
      setSelectedCommissions([]);
    } else {
      setSelectedCommissions(allCommissions);
    }
  };

  const handleOpenPaymentModal = () => {
    if (selectedCommissions.length === 0) {
      return;
    }
    setIsModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    setSelectedCommissions([]);
    refetch();
  };

  if (sessionLoading || loadingPrimaryCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando...</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa ter uma empresa primária cadastrada.</p>
      </div>
    );
  }

  const totalSelected = selectedCommissions.reduce((sum, c) => sum + c.pending_amount, 0);
  const totalPending = pendingCommissions.reduce((sum, c) => sum + c.total_pending, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/financeiro')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Pagamento de Comissões</h1>
      </div>

      {/* Filtros */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="collaborator">Colaborador</Label>
              <Select
                value={selectedCollaboratorId || 'all'}
                onValueChange={(value) => setSelectedCollaboratorId(value === 'all' ? null : value)}
              >
                <SelectTrigger id="collaborator" className="mt-1">
                  <SelectValue placeholder="Todos os colaboradores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os colaboradores</SelectItem>
                  {collaborators.map(collab => (
                    <SelectItem key={collab.id} value={collab.id}>
                      {collab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="start_date">Data Inicial</Label>
              <Input
                id="start_date"
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => setStartDate(new Date(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="end_date">Data Final</Label>
              <Input
                id="end_date"
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => setEndDate(new Date(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">Total Pendente</p>
            <p className="text-2xl font-bold text-gray-900">
              R$ {totalPending.toFixed(2).replace('.', ',')}
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">Selecionado para Pagamento</p>
            <p className="text-2xl font-bold text-yellow-600">
              R$ {totalSelected.toFixed(2).replace('.', ',')}
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-4">
            <p className="text-sm text-gray-600">Comissões Selecionadas</p>
            <p className="text-2xl font-bold text-gray-900">
              {selectedCommissions.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ações */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleSelectAll}
          className="!rounded-button"
        >
          {pendingCommissions.flatMap(c => c.commissions).every(comm =>
            selectedCommissions.some(sel => sel.id === comm.id)
          ) ? 'Desmarcar Todas' : 'Selecionar Todas'}
        </Button>
        <Button
          onClick={handleOpenPaymentModal}
          disabled={selectedCommissions.length === 0}
          className="!rounded-button bg-yellow-600 hover:bg-yellow-700 text-black"
        >
          <i className="fas fa-money-bill-wave mr-2"></i>
          Efetuar Pagamento ({selectedCommissions.length})
        </Button>
      </div>

      {/* Lista de Comissões */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Comissões Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCommissions ? (
            <p className="text-gray-600 text-center p-4">Carregando comissões...</p>
          ) : pendingCommissions.length === 0 ? (
            <p className="text-gray-600 text-center p-4">Nenhuma comissão pendente no período selecionado.</p>
          ) : (
            <div className="space-y-6">
              {pendingCommissions.map(collaboratorData => (
                <div key={collaboratorData.collaborator_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {collaboratorData.collaborator_name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Total pendente: R$ {collaboratorData.total_pending.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAllFromCollaborator(collaboratorData.collaborator_id)}
                      className="!rounded-button"
                    >
                      {collaboratorData.commissions.every(comm =>
                        selectedCommissions.some(sel => sel.id === comm.id)
                      ) ? 'Desmarcar Todas' : 'Selecionar Todas'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {collaboratorData.commissions.map(commission => {
                      const isSelected = selectedCommissions.some(sel => sel.id === commission.id);
                      return (
                        <div
                          key={commission.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${
                            isSelected ? 'border-yellow-600 bg-yellow-50' : 'border-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectCommission(commission)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{commission.service_names}</p>
                                <p className="text-sm text-gray-600">
                                  {format(parseISO(commission.appointment_date), 'dd/MM/yyyy', { locale: ptBR })} - 
                                  Agendamento: {commission.appointment_id.substring(0, 8)}...
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">
                                  Pendente: R$ {commission.pending_amount.toFixed(2).replace('.', ',')}
                                </p>
                                {commission.paid_amount > 0 && (
                                  <p className="text-sm text-gray-600">
                                    Já pago: R$ {commission.paid_amount.toFixed(2).replace('.', ',')}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500">
                                  Total: R$ {commission.total_commission.toFixed(2).replace('.', ',')}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Pagamento */}
      {primaryCompanyId && (
        <CommissionPaymentModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedCommissions={selectedCommissions}
          companyId={primaryCompanyId}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
};

export default CommissionPaymentPage;


