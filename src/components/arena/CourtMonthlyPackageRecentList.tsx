import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PaymentMethod = 'dinheiro' | 'mercado_pago';

export type PackageRow = {
  id: string;
  created_at: string;
  reference_month: string;
  week_day: number;
  start_time: string;
  payment_method: PaymentMethod;
  payment_status: string;
  status: string;
  total_amount: number;
  discount_amount: number;
  occurrences_count: number;
  bonus_occurrences_count: number;
  batch_id?: string | null;
  clients?: { name?: string } | null;
  courts?: { name?: string } | null;
  court_monthly_plans?: { name?: string } | null;
};

export type BatchRow = {
  id: string;
  created_at: string;
  start_month: string;
  duration_months: number;
  payment_method?: 'dinheiro' | 'mercado_pago';
  created_count: number;
  skipped_count: number;
  failed_count: number;
  clients?: { name?: string } | null;
  courts?: { name?: string } | null;
};

const WEEK_DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

export interface CourtMonthlyPackageRecentListProps {
  packages: PackageRow[];
  batches: BatchRow[];
  batchFilter: string;
  onBatchFilterChange: (value: string) => void;
  formatBatchLabel: (batch: BatchRow) => string;
  onOpenCheckout: (packageId: string) => void;
  onCancelPackage?: (packageId: string) => void;
  cancellingPackageId?: string | null;
  onBackfillCashReceipt?: (packageId: string) => void;
  backfillingPackageId?: string | null;
  onBackfillAllCashReceipts?: () => void;
  backfillingAll?: boolean;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  active: 'Ativo',
  cancelled: 'Cancelado',
};

const CourtMonthlyPackageRecentList: React.FC<CourtMonthlyPackageRecentListProps> = ({
  packages,
  batches,
  batchFilter,
  onBatchFilterChange,
  formatBatchLabel,
  onOpenCheckout,
  onCancelPackage,
  cancellingPackageId,
  onBackfillCashReceipt,
  backfillingPackageId,
  onBackfillAllCashReceipts,
  backfillingAll,
}) => {
  const filtered =
    batchFilter === 'all' ? packages : packages.filter((p) => p.batch_id === batchFilter);

  const canBackfillPackage = (pkg: PackageRow) =>
    pkg.payment_method === 'dinheiro' &&
    pkg.payment_status === 'paid' &&
    pkg.status !== 'cancelled';

  const hasBackfillCandidates = packages.some(canBackfillPackage);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Pacotes mensais recentes</CardTitle>
          {hasBackfillCandidates && onBackfillAllCashReceipts ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={backfillingAll}
              onClick={onBackfillAllCashReceipts}
            >
              {backfillingAll ? 'Regularizando...' : 'Regularizar todos (dinheiro)'}
            </Button>
          ) : null}
        </div>
        {batches.length > 0 ? (
          <div className="max-w-md">
            <Label className="text-xs text-gray-600">Filtrar por lote de geração</Label>
            <Select value={batchFilter} onValueChange={onBatchFilterChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pacotes</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {formatBatchLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-600">
            {batchFilter === 'all'
              ? 'Nenhum pacote mensal criado ainda.'
              : 'Nenhum pacote neste lote.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((pkg) => (
              <div key={pkg.id} className="border rounded-md p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {pkg.clients?.name || 'Cliente'} · {pkg.courts?.name || 'Quadra'} ·{' '}
                    {String(pkg.reference_month).slice(0, 7)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pkg.batch_id ? (
                      <Badge variant="outline" className="text-[10px]">
                        Lote
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      {pkg.payment_method === 'dinheiro' ? 'Dinheiro' : 'Mercado Pago'}
                    </Badge>
                    <Badge variant="secondary">
                      {PAYMENT_STATUS_LABELS[pkg.payment_status] ?? pkg.payment_status}
                    </Badge>
                    <Badge>{PACKAGE_STATUS_LABELS[pkg.status] ?? pkg.status}</Badge>
                  </div>
                </div>
                <p>
                  Plano: {pkg.court_monthly_plans?.name || 'Sem plano'} · Dia{' '}
                  {WEEK_DAYS.find((w) => w.value === pkg.week_day)?.label} às{' '}
                  {String(pkg.start_time).slice(0, 5)}
                </p>
                <p>
                  Total: R$ {Number(pkg.total_amount || 0).toFixed(2).replace('.', ',')} · Desconto: R${' '}
                  {Number(pkg.discount_amount || 0).toFixed(2).replace('.', ',')} · Ocorrências:{' '}
                  {pkg.occurrences_count} ({pkg.bonus_occurrences_count} bônus)
                </p>
                <div className="flex flex-wrap gap-2">
                  {pkg.payment_method === 'mercado_pago' && pkg.status === 'pending_payment' ? (
                    <Button size="sm" variant="outline" onClick={() => onOpenCheckout(pkg.id)}>
                      Abrir checkout
                    </Button>
                  ) : null}
                  {canBackfillPackage(pkg) && onBackfillCashReceipt ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={backfillingPackageId === pkg.id || backfillingAll}
                      onClick={() => onBackfillCashReceipt(pkg.id)}
                    >
                      {backfillingPackageId === pkg.id ? 'Regularizando...' : 'Regularizar recebimento'}
                    </Button>
                  ) : null}
                  {pkg.status !== 'cancelled' && onCancelPackage ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={cancellingPackageId === pkg.id}
                      onClick={() => onCancelPackage(pkg.id)}
                    >
                      {cancellingPackageId === pkg.id ? 'Cancelando...' : 'Cancelar pacote'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CourtMonthlyPackageRecentList;
