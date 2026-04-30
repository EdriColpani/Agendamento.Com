import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Copy, Link2, Wallet, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ExternalSalesAttributionPanel } from '@/components/admin/ExternalSalesAttributionPanel';
import { ExternalSalesPayoutBlock } from '@/components/admin/ExternalSalesPayoutBlock';

const REGISTRATION_PATH = '/register-professional';
const getReferralBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${REGISTRATION_PATH}`;
};

interface ExternalRep {
  id: string;
  referral_code: string;
  display_name: string;
  email: string | null;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
}

interface LedgerRow {
  id: string;
  created_at: string;
  commission_amount: number;
  ledger_kind: string;
  source_kind: string;
  mercadopago_payment_id: string;
  external_sales_representatives: { display_name: string } | null;
  companies: { name: string } | null;
}

const ExternalSalesRepManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [reps, setReps] = useState<ExternalRep[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusRepForPayout, setFocusRepForPayout] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalRep | null>(null);
  const [form, setForm] = useState({
    referral_code: '',
    display_name: '',
    email: '',
    commission_percent: '10',
    is_active: true,
  });

  const fetchReps = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('external_sales_representatives')
      .select('id, referral_code, display_name, email, commission_percent, is_active, created_at')
      .order('display_name', { ascending: true });
    if (error) {
      showError('Erro ao carregar vendedores: ' + error.message);
    } else {
      setReps((data as ExternalRep[]) || []);
    }
    setLoading(false);
  }, [session]);

  const fetchBalances = useCallback(async () => {
    if (!session?.user) return;
    const { data, error } = await supabase.rpc('external_sales_rep_balances');
    if (error) {
      console.error('external_sales_rep_balances', error);
      return;
    }
    const m: Record<string, number> = {};
    for (const row of (data as { representative_id: string; balance: number | string }[]) || []) {
      m[row.representative_id] = Number(row.balance);
    }
    setBalances(m);
  }, [session]);

  const fetchLedger = useCallback(async () => {
    if (!session?.user) return;
    const { data, error } = await supabase
      .from('external_sales_commission_ledger')
      .select(
        'id, created_at, commission_amount, ledger_kind, source_kind, mercadopago_payment_id, external_sales_representatives(display_name), companies(name)',
      )
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) {
      console.error('ledger', error);
    } else {
      setLedger((data as LedgerRow[]) || []);
    }
  }, [session]);

  useEffect(() => {
    void fetchReps();
    void fetchLedger();
    void fetchBalances();
  }, [fetchReps, fetchLedger, fetchBalances]);

  const refreshFinancials = useCallback(async () => {
    await fetchBalances();
    await fetchLedger();
  }, [fetchBalances, fetchLedger]);

  const consumePayoutFocus = useCallback(() => {
    setFocusRepForPayout(null);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      referral_code: '',
      display_name: '',
      email: '',
      commission_percent: '10',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (r: ExternalRep) => {
    setEditing(r);
    setForm({
      referral_code: r.referral_code,
      display_name: r.display_name,
      email: r.email || '',
      commission_percent: String(r.commission_percent),
      is_active: r.is_active,
    });
    setModalOpen(true);
  };

  const saveRep = async () => {
    const pct = parseFloat(form.commission_percent.replace(',', '.'));
    if (!form.display_name.trim()) {
      showError('Nome é obrigatório.');
      return;
    }
    if (!form.referral_code.trim()) {
      showError('Código de indicação é obrigatório.');
      return;
    }
    const code = form.referral_code.trim().toLowerCase();
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      showError('Percentual de comissão inválido (0–100).');
      return;
    }

    const payload = {
      referral_code: code,
      display_name: form.display_name.trim(),
      email: form.email.trim() || null,
      commission_percent: pct,
      is_active: form.is_active,
    };

    try {
      if (editing) {
        const { error } = await supabase
          .from('external_sales_representatives')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        showSuccess('Vendedor atualizado.');
      } else {
        const { error } = await supabase.from('external_sales_representatives').insert(payload);
        if (error) throw error;
        showSuccess('Vendedor cadastrado.');
      }
      setModalOpen(false);
      await fetchReps();
      await fetchBalances();
    } catch (e: unknown) {
      const err = e as { message?: string };
      showError(err.message || 'Erro ao salvar.');
    }
  };

  const copyLink = (code: string) => {
    const url = `${getReferralBaseUrl()}?ref=${encodeURIComponent(code)}`;
    void navigator.clipboard.writeText(url);
    showSuccess('Link copiado.');
  };

  const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) {
      showError('Nada para exportar.');
      return;
    }
    const keys = Object.keys(rows[0] as object);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      keys.join(','),
      ...rows.map((r) => keys.map((k) => esc(r[k])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Arquivo gerado.');
  };

  const exportLedgerCsv = async () => {
    const { data, error } = await supabase
      .from('external_sales_commission_ledger')
      .select(
        'created_at, ledger_kind, source_kind, commission_amount, base_amount, mercadopago_payment_id, external_sales_representatives(display_name), companies(name)',
      )
      .order('created_at', { ascending: false })
      .limit(3000);
    if (error) {
      showError(error.message);
      return;
    }
    const flat =
      (data as Record<string, unknown>[])?.map((row) => ({
        created_at: row.created_at,
        ledger_kind: row.ledger_kind,
        source_kind: row.source_kind,
        commission_amount: row.commission_amount,
        base_amount: row.base_amount,
        mercadopago_payment_id: row.mercadopago_payment_id,
        vendedor:
          (row.external_sales_representatives as { display_name?: string } | null)?.display_name ?? '',
        empresa: (row.companies as { name?: string } | null)?.name ?? '',
      })) ?? [];
    downloadCsv(`external_sales_ledger_${new Date().toISOString().slice(0, 10)}.csv`, flat);
  };

  const exportPayoutsCsv = async () => {
    const { data, error } = await supabase
      .from('external_sales_payouts')
      .select(
        'paid_at, amount_paid, payment_method, reference_note, recorded_by_user_id, external_sales_representatives(display_name)',
      )
      .order('paid_at', { ascending: false })
      .limit(3000);
    if (error) {
      showError(error.message);
      return;
    }
    const flat =
      (data as Record<string, unknown>[])?.map((row) => ({
        paid_at: row.paid_at,
        amount_paid: row.amount_paid,
        payment_method: row.payment_method,
        reference_note: row.reference_note,
        recorded_by_user_id: row.recorded_by_user_id,
        vendedor:
          (row.external_sales_representatives as { display_name?: string } | null)?.display_name ?? '',
      })) ?? [];
    downloadCsv(`external_sales_payouts_${new Date().toISOString().slice(0, 10)}.csv`, flat);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/admin-dashboard')} className="!rounded-button">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vendedores externos (assinatura)</h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Representantes e link de cadastro</CardTitle>
            <Button onClick={openCreate} className="!rounded-button">
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo vendedor
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Comissão sobre pagamentos de plano é independente da comissão de colaboradores por serviço. O link abaixo
              inclui <code className="text-xs bg-muted px-1 rounded">?ref=código</code> para atribuir a empresa ao
              vendedor no primeiro cadastro.
            </p>
            {loading ? (
              <p>Carregando...</p>
            ) : reps.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">Nenhum vendedor cadastrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">Nome</th>
                      <th className="p-2">Código</th>
                      <th className="p-2">%</th>
                      <th className="p-2 text-right">Saldo R$</th>
                      <th className="p-2">Ativo</th>
                      <th className="p-2">Link</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {reps.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="p-2 font-medium">{r.display_name}</td>
                        <td className="p-2 font-mono text-xs">{r.referral_code}</td>
                        <td className="p-2">{Number(r.commission_percent).toFixed(2)}</td>
                        <td className="p-2 text-right font-mono text-xs">
                          {(balances[r.id] ?? 0).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="p-2">{r.is_active ? 'Sim' : 'Não'}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="!rounded-button"
                              onClick={() => copyLink(r.referral_code)}
                              title="Copiar link de cadastro"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copiar
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="!rounded-button"
                              onClick={() => setFocusRepForPayout(r.id)}
                              title="Registrar pagamento a este vendedor"
                            >
                              <Wallet className="h-3 w-3 mr-1" />
                              Pagar
                            </Button>
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(r)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <ExternalSalesPayoutBlock
          representatives={reps.map((r) => ({
            id: r.id,
            display_name: r.display_name,
            referral_code: r.referral_code,
          }))}
          userId={session?.user?.id}
          focusRepresentativeId={focusRepForPayout}
          onFocusConsumed={consumePayoutFocus}
          onRecorded={() => void refreshFinancials()}
        />

        <ExternalSalesAttributionPanel
          representatives={reps.map((r) => ({
            id: r.id,
            display_name: r.display_name,
            referral_code: r.referral_code,
          }))}
          sessionReady={!!session?.user}
          onAttributionChanged={() => void fetchBalances()}
        />

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Últimos lançamentos de comissão (plataforma)
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="!rounded-button" onClick={() => void exportLedgerCsv()}>
                <Download className="h-4 w-4 mr-1" />
                Exportar CSV (ledger)
              </Button>
              <Button type="button" variant="outline" size="sm" className="!rounded-button" onClick={() => void exportPayoutsCsv()}>
                <Download className="h-4 w-4 mr-1" />
                Exportar CSV (pagamentos)
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem lançamentos ainda.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">Data</th>
                      <th className="p-2">Vendedor</th>
                      <th className="p-2">Empresa</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Fonte</th>
                      <th className="p-2 text-right">Valor R$</th>
                      <th className="p-2">MP id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="p-2 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-2">{row.external_sales_representatives?.display_name ?? '—'}</td>
                        <td className="p-2 max-w-[140px] truncate" title={row.companies?.name ?? ''}>
                          {row.companies?.name ?? '—'}
                        </td>
                        <td className="p-2">{row.ledger_kind}</td>
                        <td className="p-2">{row.source_kind}</td>
                        <td className="p-2 text-right font-mono">
                          {Number(row.commission_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 font-mono text-[10px] max-w-[100px] truncate" title={row.mercadopago_payment_id}>
                          {row.mercadopago_payment_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar vendedor' : 'Novo vendedor externo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="ref_code">Código de indicação (minúsculas, único)</Label>
                <Input
                  id="ref_code"
                  value={form.referral_code}
                  onChange={(e) => setForm((f) => ({ ...f, referral_code: e.target.value.toLowerCase() }))}
                  placeholder="ex: joao2025"
                  disabled={!!editing}
                />
              </div>
              <div>
                <Label htmlFor="dname">Nome para exibição</Label>
                <Input
                  id="dname"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="em">E-mail (opcional)</Label>
                <Input
                  id="em"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pct">Comissão % sobre pagamento</Label>
                <Input
                  id="pct"
                  value={form.commission_percent}
                  onChange={(e) => setForm((f) => ({ ...f, commission_percent: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="act"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="act">Ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void saveRep()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ExternalSalesRepManagementPage;
