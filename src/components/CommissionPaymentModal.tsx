import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { format } from 'date-fns';
import { PendingCommission } from '@/hooks/usePendingCommissions';

interface CommissionPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCommissions: PendingCommission[];
  companyId: string;
  onPaymentSuccess: () => void;
}

interface PaymentItem {
  commission: PendingCommission;
  amountToPay: number;
  isSelected: boolean;
}

export const CommissionPaymentModal: React.FC<CommissionPaymentModalProps> = ({
  isOpen,
  onClose,
  selectedCommissions,
  companyId,
  onPaymentSuccess,
}) => {
  const { session } = useSession();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('dinheiro');
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [observations, setObservations] = useState<string>('');
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);

  // Atualizar paymentItems sempre que o modal abrir ou selectedCommissions mudar
  useEffect(() => {
    if (isOpen && selectedCommissions.length > 0) {
      setPaymentItems(
        selectedCommissions.map(comm => ({
          commission: comm,
          amountToPay: comm.pending_amount, // Por padrão, pagar o valor pendente total
          isSelected: true,
        }))
      );
    } else if (!isOpen) {
      // Reset quando o modal fechar
      setPaymentItems([]);
      setPaymentMethod('dinheiro');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setObservations('');
    }
  }, [isOpen, selectedCommissions]);

  const handleAmountChange = (commissionId: string, value: string) => {
    const numValue = parseFloat(value.replace(',', '.')) || 0;
    setPaymentItems(items =>
      items.map(item => {
        if (item.commission.id === commissionId) {
          // Validar: não pode ser maior que o pendente
          const maxAmount = item.commission.pending_amount;
          const validAmount = Math.min(Math.max(0, numValue), maxAmount);
          return { ...item, amountToPay: validAmount };
        }
        return item;
      })
    );
  };

  const toggleSelection = (commissionId: string) => {
    setPaymentItems(items =>
      items.map(item =>
        item.commission.id === commissionId
          ? { ...item, isSelected: !item.isSelected }
          : item
      )
    );
  };

  const handleSelectAll = () => {
    const allSelected = paymentItems.every(item => item.isSelected);
    setPaymentItems(items =>
      items.map(item => ({ ...item, isSelected: !allSelected }))
    );
  };

  const handlePayAllPending = () => {
    setPaymentItems(items =>
      items.map(item => ({
        ...item,
        amountToPay: item.commission.pending_amount,
        isSelected: true,
      }))
    );
  };

  const handleSubmit = async () => {
    if (!session?.user) {
      showError('Erro de autenticação');
      return;
    }

    // Validar itens selecionados
    const selectedItems = paymentItems.filter(item => item.isSelected && item.amountToPay > 0);
    if (selectedItems.length === 0) {
      showError('Selecione pelo menos uma comissão para pagar');
      return;
    }

    // Validar valores
    for (const item of selectedItems) {
      if (item.amountToPay <= 0) {
        showError(`O valor a pagar deve ser maior que zero para ${item.commission.collaborator_name}`);
        return;
      }
      if (item.amountToPay > item.commission.pending_amount) {
        showError(`O valor a pagar não pode ser maior que o pendente para ${item.commission.collaborator_name}`);
        return;
      }
    }

    setLoading(true);
    try {
      const paymentDateTime = `${paymentDate}T${format(new Date(), 'HH:mm:ss')}`;
      const baseObservation = observations.trim() || 'Pagamento de comissão';

      // Processar cada pagamento
      const paymentPromises = selectedItems.map(async (item) => {
        const { commission, amountToPay } = item;

        // 1. Inserir registro em commission_payments
        const { error: paymentError } = await supabase
          .from('commission_payments')
          .insert({
            cash_movement_id: commission.cash_movement_id,
            company_id: companyId,
            collaborator_id: commission.collaborator_id,
            amount_paid: amountToPay,
            payment_date: paymentDateTime,
            payment_method: paymentMethod,
            observations: `${baseObservation} - ${commission.collaborator_name} - ${commission.service_names} (Agendamento: ${commission.appointment_id.substring(0, 8)}...)`,
            user_id: session.user.id,
          });

        if (paymentError) {
          throw new Error(`Erro ao registrar pagamento para ${commission.collaborator_name}: ${paymentError.message}`);
        }

        // 2. Criar transação financeira em cash_movements
        const { error: transactionError } = await supabase
          .from('cash_movements')
          .insert({
            company_id: companyId,
            user_id: session.user.id,
            transaction_type: 'despesa',
            total_amount: amountToPay,
            payment_method: paymentMethod,
            transaction_date: paymentDateTime,
            observations: `Pagamento de comissão - ${commission.collaborator_name} - ${commission.service_names} (Agendamento: ${commission.appointment_id.substring(0, 8)}...)`,
            appointment_id: null, // Pagamento manual, não vinculado ao agendamento
          });

        if (transactionError) {
          throw new Error(`Erro ao criar transação financeira para ${commission.collaborator_name}: ${transactionError.message}`);
        }
      });

      await Promise.all(paymentPromises);

      const totalPaid = selectedItems.reduce((sum, item) => sum + item.amountToPay, 0);
      const collaboratorsCount = new Set(selectedItems.map(item => item.commission.collaborator_id)).size;

      showSuccess(
        `Pagamento(s) realizado(s) com sucesso! Total: R$ ${totalPaid.toFixed(2).replace('.', ',')} para ${collaboratorsCount} colaborador(es)`
      );

      onPaymentSuccess();
      onClose();

      // Reset form
      setPaymentMethod('dinheiro');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setObservations('');
    } catch (error: any) {
      console.error('[CommissionPaymentModal] Erro ao processar pagamento:', error);
      showError(error.message || 'Erro ao processar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = paymentItems.filter(item => item.isSelected).length;
  const totalToPay = paymentItems
    .filter(item => item.isSelected)
    .reduce((sum, item) => sum + item.amountToPay, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Efetuar Pagamento de Comissões</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Resumo */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              <strong>{selectedCount}</strong> comissão(ões) selecionada(s) de <strong>{new Set(selectedCommissions.map(c => c.collaborator_id)).size}</strong> colaborador(es)
            </p>
            <p className="text-lg font-bold text-gray-900">
              Total a pagar: R$ {totalToPay.toFixed(2).replace('.', ',')}
            </p>
          </div>

          {/* Ações rápidas */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="!rounded-button"
            >
              {paymentItems.every(item => item.isSelected) ? 'Desmarcar Todas' : 'Selecionar Todas'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePayAllPending}
              className="!rounded-button"
            >
              Pagar Valor Total Pendente
            </Button>
          </div>

          {/* Lista de comissões */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {paymentItems.map((item) => {
              const { commission, amountToPay, isSelected } = item;
              return (
                <div
                  key={commission.id}
                  className={`border rounded-lg p-4 ${isSelected ? 'border-primary bg-primary/10' : 'border-gray-200'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(commission.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{commission.collaborator_name}</p>
                          <p className="text-sm text-gray-600">{commission.service_names}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(commission.appointment_date), 'dd/MM/yyyy')} - 
                            Pendente: R$ {commission.pending_amount.toFixed(2).replace('.', ',')}
                            {commission.paid_amount > 0 && (
                              <span className="ml-2">(Já pago: R$ {commission.paid_amount.toFixed(2).replace('.', ',')})</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-2">
                          <Label htmlFor={`amount-${commission.id}`} className="text-sm">
                            Valor a pagar (máx: R$ {commission.pending_amount.toFixed(2).replace('.', ',')})
                          </Label>
                          <Input
                            id={`amount-${commission.id}`}
                            type="text"
                            value={amountToPay.toFixed(2).replace('.', ',')}
                            onChange={(e) => handleAmountChange(commission.id, e.target.value)}
                            className="mt-1"
                            placeholder="0,00"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Configurações de pagamento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <Label htmlFor="payment_method">Método de Pagamento *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment_method" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payment_date">Data do Pagamento *</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="observations">Observações</Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="mt-1"
              placeholder="Observações sobre o pagamento..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="!rounded-button"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || selectedCount === 0 || totalToPay <= 0}
            className="!rounded-button bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? 'Processando...' : `Confirmar Pagamento (R$ ${totalToPay.toFixed(2).replace('.', ',')})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

