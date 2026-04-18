import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useCashClosures, ClosureType } from '@/hooks/useCashClosure';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ReopenCashClosureModal } from '@/components/ReopenCashClosureModal';
import { useIsProprietario } from '@/hooks/useIsProprietario';

const CashClosuresPage: React.FC = () => {
  const navigate = useNavigate();
  const [closureTypeFilter, setClosureTypeFilter] = useState<ClosureType | null>(null);
  const { closures, loading, refetch } = useCashClosures(closureTypeFilter);
  const { isProprietario } = useIsProprietario();
  const [selectedClosureId, setSelectedClosureId] = useState<string | null>(null);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);

  const getClosureTypeLabel = (type: ClosureType) => {
    const labels = {
      dia: 'Dia',
      semana: 'Semana',
      quinzena: 'Quinzena',
      mes: 'Mês',
    };
    return labels[type];
  };

  const handleReopenClick = (closureId: string) => {
    setSelectedClosureId(closureId);
    setIsReopenModalOpen(true);
  };

  const handleReopened = () => {
    refetch();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando fechamentos...</p>
      </div>
    );
  }

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
        <h1 className="text-3xl font-bold text-gray-900">Fechamentos de Caixa</h1>
      </div>

      {/* Filtro */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Select
              value={closureTypeFilter || 'all'}
              onValueChange={(value) => setClosureTypeFilter(value === 'all' ? null : (value as ClosureType))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="dia">Dia</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="quinzena">Quinzena</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Fechamentos */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Histórico de Fechamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {closures.length === 0 ? (
            <p className="text-gray-600 text-center p-4">Nenhum fechamento encontrado.</p>
          ) : (
            <div className="space-y-4">
              {closures.map((closure) => (
                <div key={closure.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-1 bg-primary/10 text-amber-900 text-xs font-semibold rounded">
                          {getClosureTypeLabel(closure.closure_type)}
                        </span>
                        <span className="text-sm text-gray-600">
                          {format(parseISO(closure.start_date), 'dd/MM/yyyy', { locale: ptBR })} a{' '}
                          {format(parseISO(closure.end_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Fechado em {format(parseISO(closure.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    {isProprietario && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReopenClick(closure.id)}
                        className="ml-4"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reabrir Caixa
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-600">Recebimentos</p>
                      <p className="text-sm font-bold text-green-600">
                        R$ {closure.total_receipts.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Despesas</p>
                      <p className="text-sm font-bold text-red-600">
                        R$ {closure.total_expenses.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Saldo</p>
                      <p className="text-sm font-bold text-primary">
                        R$ {closure.total_balance.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Dinheiro Contado</p>
                      <p className="text-sm font-bold text-gray-900">
                        R$ {closure.cash_counted.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  </div>
                  {closure.observations && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">Observações:</p>
                      <p className="text-sm text-gray-700">{closure.observations}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Reabertura */}
      {selectedClosureId && (
        <ReopenCashClosureModal
          isOpen={isReopenModalOpen}
          onClose={() => {
            setIsReopenModalOpen(false);
            setSelectedClosureId(null);
          }}
          closureId={selectedClosureId}
          onReopened={handleReopened}
        />
      )}
    </div>
  );
};

export default CashClosuresPage;

