import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

export interface ExternalRepOption {
  id: string;
  display_name: string;
  referral_code: string;
}

interface PayoutRow {
  id: string;
  paid_at: string;
  amount_paid: number;
  payment_method: string;
  reference_note: string | null;
  external_sales_representatives: { display_name: string } | null;
}

interface ExternalSalesPayoutBlockProps {
  representatives: ExternalRepOption[];
  userId: string | undefined;
  /** Ao clicar "Pagar" na tabela de vendedores, pré-preenche o vendedor */
  focusRepresentativeId: string | null;
  onFocusConsumed: () => void;
  onRecorded: () => void;
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'outro', label: 'Outro' },
] as const;

export const ExternalSalesPayoutBlock: React.FC<ExternalSalesPayoutBlockProps> = ({
  representatives,
  userId,
  focusRepresentativeId,
  onFocusConsumed,
  onRecorded,
}) => {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repId, setRepId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('pix');
  const [paidAt, setPaidAt] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState('');

  const fetchPayouts = useCallback(async () => {
    if (!userId) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from('external_sales_payouts')
      .select(
        'id, paid_at, amount_paid, payment_method, reference_note, external_sales_representatives(display_name)',
      )
      .order('paid_at', { ascending: false })
      .limit(50);
    setLoadingList(false);
    if (error) {
      console.error('external_sales_payouts', error);
      showError('Erro ao carregar pagamentos: ' + error.message);
      return;
    }
    setPayouts((data as PayoutRow[]) || []);
  }, [userId]);

  useEffect(() => {
    void fetchPayouts();
  }, [fetchPayouts]);

  useEffect(() => {
    if (focusRepresentativeId) {
      setRepId(focusRepresentativeId);
      onFocusConsumed();
    }
  }, [focusRepresentativeId, onFocusConsumed]);

  const submitPayout = async () => {
    if (!userId) {
      showError('Sessão inválida.');
      return;
    }
    if (!repId) {
      showError('Selecione o vendedor.');
      return;
    }
    const n = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      showError('Informe um valor válido maior que zero.');
      return;
    }

    setSaving(true);
    try {
      const paidIso = new Date(paidAt).toISOString();
      const { error } = await supabase.from('external_sales_payouts').insert({
        representative_id: repId,
        amount_paid: n,
        paid_at: paidIso,
        payment_method: method,
        reference_note: note.trim() || null,
        recorded_by_user_id: userId,
      });
      if (error) throw error;
      showSuccess('Pagamento registrado.');
      setAmount('');
      setNote('');
      await fetchPayouts();
      onRecorded();
    } catch (e: unknown) {
      const err = e as { message?: string };
      showError(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Registrar pagamento ao vendedor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O saldo na tabela acima é: total de comissões no ledger menos pagamentos já lançados aqui. Pagamentos não
            alteram o ledger; servem para controle do que já foi pago ao representante.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={repId || undefined} onValueChange={setRepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {representatives.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.display_name} ({r.referral_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-amt">Valor pago (R$)</Label>
              <Input
                id="payout-amt"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Forma</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-when">Data/hora do pagamento</Label>
              <Input
                id="payout-when"
                type="datetime-local"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="payout-note">Observações (opcional)</Label>
              <Input
                id="payout-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: comprovante, período referente..."
              />
            </div>
          </div>
          <Button type="button" className="!rounded-button" disabled={saving || representatives.length === 0} onClick={() => void submitPayout()}>
            {saving ? 'Salvando...' : 'Registrar pagamento'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos pagamentos ao vendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Data</th>
                    <th className="p-2">Vendedor</th>
                    <th className="p-2 text-right">Valor</th>
                    <th className="p-2">Forma</th>
                    <th className="p-2">Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-2 whitespace-nowrap">{new Date(row.paid_at).toLocaleString('pt-BR')}</td>
                      <td className="p-2">{row.external_sales_representatives?.display_name ?? '—'}</td>
                      <td className="p-2 text-right font-mono">
                        {Number(row.amount_paid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2">{row.payment_method}</td>
                      <td className="p-2 max-w-[180px] truncate" title={row.reference_note ?? ''}>
                        {row.reference_note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
