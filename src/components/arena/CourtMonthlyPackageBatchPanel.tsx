import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BatchRow, PackageRow } from '@/components/arena/CourtMonthlyPackageRecentList';
import { cn } from '@/lib/utils';
import {
  arenaBodyClass,
  arenaSectionTitleClass,
  arenaTouchButtonClass,
} from '@/components/arena/arenaPageStyles';

export interface CourtMonthlyPackageBatchPanelProps {
  batch: BatchRow;
  packages: PackageRow[];
  formatMonthLabel: (referenceMonth: string) => string;
  onCancelBatch: () => void;
  onComplementBatch: () => void;
  onOpenCheckout: (packageId: string) => void;
  cancelling: boolean;
  complementing: boolean;
}

const CourtMonthlyPackageBatchPanel: React.FC<CourtMonthlyPackageBatchPanelProps> = ({
  batch,
  packages,
  formatMonthLabel,
  onCancelBatch,
  onComplementBatch,
  onOpenCheckout,
  cancelling,
  complementing,
}) => {
  const batchPackages = useMemo(
    () => packages.filter((p) => p.batch_id === batch.id),
    [packages, batch.id],
  );

  const activeCount = batchPackages.filter((p) => p.status !== 'cancelled').length;
  const pendingMp = batchPackages.filter(
    (p) => p.payment_method === 'mercado_pago' && p.status === 'pending_payment',
  );

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardHeader className="pb-2">
        <CardTitle className={arenaSectionTitleClass}>Ações do lote selecionado</CardTitle>
        <p className={arenaBodyClass}>
          Início {formatMonthLabel(String(batch.start_month).slice(0, 10))} · {batch.duration_months}{' '}
          meses · {batch.created_count} criados · {batch.skipped_count} ignorados · {batch.failed_count}{' '}
          falhas
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            className={cn('w-full sm:w-auto', arenaTouchButtonClass)}
            disabled={cancelling || activeCount === 0}
            onClick={onCancelBatch}
          >
            {cancelling ? 'Cancelando lote...' : 'Cancelar lote inteiro'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full sm:w-auto', arenaTouchButtonClass)}
            disabled={complementing}
            onClick={onComplementBatch}
          >
            {complementing ? 'Complementando...' : 'Complementar meses faltantes'}
          </Button>
        </div>

        {batch.payment_method === 'mercado_pago' && pendingMp.length > 0 ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-white/80 p-3 dark:bg-gray-900/40">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Checkouts Mercado Pago pendentes ({pendingMp.length})
            </p>
            <p className={arenaBodyClass}>
              Cada mês do lote exige pagamento online separado.
            </p>
            <ul className="space-y-2">
              {pendingMp.map((pkg) => (
                <li key={pkg.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-base font-medium">
                    {formatMonthLabel(String(pkg.reference_month).slice(0, 10))} · R${' '}
                    {Number(pkg.total_amount || 0).toFixed(2).replace('.', ',')}
                  </span>
                  <Button type="button" className={arenaTouchButtonClass} variant="outline" onClick={() => onOpenCheckout(pkg.id)}>
                    Abrir checkout
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {activeCount === 0 ? (
          <Badge variant="secondary">Todos os pacotes deste lote já estão cancelados</Badge>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default CourtMonthlyPackageBatchPanel;
