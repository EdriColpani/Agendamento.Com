import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

type PaymentMethod = 'dinheiro' | 'mercado_pago';
type ContractMode = 'single' | 'period';

type PlanRow = { id: string; name: string; is_active: boolean };
type ClientRow = { id: string; name: string };
type CourtRow = { id: string; name: string; slot_duration_minutes: number };

const DURATION_OPTIONS = [1, 3, 6, 9, 12] as const;

export type PeriodPreviewMonth = {
  reference_month: string;
  status: 'available' | 'duplicate' | string;
};

export type PeriodPreviewResult = {
  requested_months: number;
  available_count: number;
  duplicate_count: number;
  months: PeriodPreviewMonth[];
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

export interface CourtMonthlyPackageCreateCardProps {
  contractMode: ContractMode;
  onContractModeChange: (mode: ContractMode) => void;
  durationMonths: (typeof DURATION_OPTIONS)[number];
  onDurationMonthsChange: (n: (typeof DURATION_OPTIONS)[number]) => void;
  periodMonthLabels: string[];
  periodPreview: PeriodPreviewResult | null;
  periodPreviewLoading: boolean;
  formatMonthLabel: (referenceMonth: string) => string;
  todayMonth: string;
  clients: ClientRow[];
  courts: CourtRow[];
  plans: PlanRow[];
  selectedClientId: string;
  onSelectedClientIdChange: (id: string) => void;
  selectedCourtId: string;
  onSelectedCourtIdChange: (id: string) => void;
  referenceMonth: string;
  onReferenceMonthChange: (v: string) => void;
  weekDay: string;
  onWeekDayChange: (v: string) => void;
  startTime: string;
  onStartTimeChange: (v: string) => void;
  durationMinutes: string;
  onDurationMinutesChange: (v: string) => void;
  selectedPlanId: string;
  onSelectedPlanIdChange: (v: string) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (v: PaymentMethod) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  savingPackage: boolean;
  onSubmit: () => void;
}

const CourtMonthlyPackageCreateCard: React.FC<CourtMonthlyPackageCreateCardProps> = ({
  contractMode,
  onContractModeChange,
  durationMonths,
  onDurationMonthsChange,
  periodMonthLabels,
  periodPreview,
  periodPreviewLoading,
  formatMonthLabel,
  todayMonth,
  clients,
  courts,
  plans,
  selectedClientId,
  onSelectedClientIdChange,
  selectedCourtId,
  onSelectedCourtIdChange,
  referenceMonth,
  onReferenceMonthChange,
  weekDay,
  onWeekDayChange,
  startTime,
  onStartTimeChange,
  durationMinutes,
  onDurationMinutesChange,
  selectedPlanId,
  onSelectedPlanIdChange,
  paymentMethod,
  onPaymentMethodChange,
  notes,
  onNotesChange,
  savingPackage,
  onSubmit,
}) => {
  const isPeriod = contractMode === 'period';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar pacote mensal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo de contratação</Label>
          <RadioGroup
            value={contractMode}
            onValueChange={(v) => onContractModeChange(v as ContractMode)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="single" id="contract-single" />
              <Label htmlFor="contract-single" className="font-normal cursor-pointer">
                Mês único
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="period" id="contract-period" />
              <Label htmlFor="contract-period" className="font-normal cursor-pointer">
                Período (vários meses)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {isPeriod ? (
          <div className="space-y-2">
            <Label>Duração do contrato</Label>
            <Select
              value={String(durationMonths)}
              onValueChange={(v) => onDurationMonthsChange(Number(v) as (typeof DURATION_OPTIONS)[number])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? 'mês' : 'meses'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600">
              Serão gerados {durationMonths} pacote(s): {periodMonthLabels.join(' · ') || '—'}
            </p>
            <p className="text-xs text-gray-500">
              Valor calculado individualmente em cada mês.
            </p>
            <Alert className="border-slate-200 bg-slate-50 dark:bg-slate-900/40">
              <AlertTitle className="text-sm">Pré-visualização do período</AlertTitle>
              <AlertDescription asChild>
                <div className="mt-2 space-y-2">
                  {periodPreviewLoading ? (
                    <p className="text-xs text-gray-600 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Verificando meses…
                    </p>
                  ) : periodPreview ? (
                    <>
                      <p className="text-xs text-gray-700">
                        {periodPreview.available_count} mês(es) serão gerados ·{' '}
                        {periodPreview.duplicate_count} já existente(s)
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {(periodPreview.months || []).map((m) => (
                          <li key={m.reference_month}>
                            <Badge
                              variant={m.status === 'duplicate' ? 'secondary' : 'default'}
                              className="text-[11px] font-normal"
                            >
                              {formatMonthLabel(m.reference_month)}
                              {m.status === 'duplicate' ? ' · já existe' : ''}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-gray-500">
                        Conflitos de horário só são validados na confirmação.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">
                      Preencha cliente, quadra e horário para ver a pré-visualização.
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Cliente</Label>
            <Select value={selectedClientId} onValueChange={onSelectedClientIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quadra</Label>
            <Select
              value={selectedCourtId}
              onValueChange={(v) => {
                onSelectedCourtIdChange(v);
                const court = courts.find((c) => c.id === v);
                if (court) onDurationMinutesChange(String(court.slot_duration_minutes || 60));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {courts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isPeriod ? 'Mês de referência (início)' : 'Mês de referência'}</Label>
            <Input
              type="month"
              min={isPeriod ? todayMonth : undefined}
              value={referenceMonth}
              onChange={(e) => onReferenceMonthChange(e.target.value)}
            />
          </div>
          <div>
            <Label>Dia da semana</Label>
            <Select value={weekDay} onValueChange={onWeekDayChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK_DAYS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horário</Label>
            <Input type="time" value={startTime} onChange={(e) => onStartTimeChange(e.target.value)} />
          </div>
          <div>
            <Label>Duração (min)</Label>
            <Input
              type="number"
              min={15}
              max={1440}
              value={durationMinutes}
              onChange={(e) => onDurationMinutesChange(e.target.value)}
            />
          </div>
          <div>
            <Label>Plano de benefício (opcional)</Label>
            <Select value={selectedPlanId} onValueChange={onSelectedPlanIdChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem plano (valor cheio)</SelectItem>
                {plans
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={(v) => onPaymentMethodChange(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Pago no balcão (interno)</SelectItem>
                <SelectItem value="mercado_pago">Pagamento online (Mercado Pago)</SelectItem>
              </SelectContent>
            </Select>
            {isPeriod && paymentMethod === 'mercado_pago' ? (
              <p className="text-xs text-amber-700 mt-1">
                No período com Mercado Pago, cada mês gerado terá checkout separado após a criação.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} />
        </div>

        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 !rounded-button"
          disabled={savingPackage}
          onClick={onSubmit}
        >
          {savingPackage
            ? isPeriod
              ? 'Gerando pacotes...'
              : 'Criando pacote...'
            : isPeriod
              ? 'Gerar pacotes do período'
              : 'Criar pacote mensal'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CourtMonthlyPackageCreateCard;
