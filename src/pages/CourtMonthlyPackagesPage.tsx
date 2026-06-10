import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { invokeEdgeWithAuthOrThrow } from '@/utils/edge-invoke';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import CourtMonthlyPackageCreateCard, {
  type PeriodPreviewResult,
} from '@/components/arena/CourtMonthlyPackageCreateCard';
import CourtMonthlyPackageRecentList, {
  type BatchRow,
  type PackageRow,
} from '@/components/arena/CourtMonthlyPackageRecentList';
import CourtMonthlyPackageBatchPanel from '@/components/arena/CourtMonthlyPackageBatchPanel';
import ArenaToolbar, {
  arenaToolbarBtnClass,
  arenaToolbarSolidClass,
} from '@/components/arena/ArenaToolbar';
import { getArenaModuleLinks } from '@/components/arena/arenaNavConfig';
import {
  arenaLabelClass,
  arenaSectionTitleClass,
  arenaTouchButtonClass,
  arenaTouchInputClass,
} from '@/components/arena/arenaPageStyles';

type BenefitType = 'discount_percent' | 'discount_fixed' | 'pay_x_get_y';
type PaymentMethod = 'dinheiro' | 'mercado_pago';

type PlanRow = {
  id: string;
  name: string;
  benefit_type: BenefitType;
  is_active: boolean;
  description?: string | null;
  discount_percent?: number | null;
  discount_fixed_amount?: number | null;
  pay_for_slots?: number | null;
  bonus_slots?: number | null;
};

const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  discount_percent: 'Desconto percentual',
  discount_fixed: 'Desconto fixo (R$)',
  pay_x_get_y: 'Pague X e leve Y',
};

function formatPlanBenefitSummary(plan: PlanRow): string {
  const base = BENEFIT_TYPE_LABELS[plan.benefit_type];
  if (plan.benefit_type === 'discount_percent' && plan.discount_percent != null) {
    return `${base} · ${plan.discount_percent}%`;
  }
  if (plan.benefit_type === 'discount_fixed' && plan.discount_fixed_amount != null) {
    const value = Number(plan.discount_fixed_amount).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    return `${base} · ${value}`;
  }
  if (
    plan.benefit_type === 'pay_x_get_y' &&
    plan.pay_for_slots != null &&
    plan.bonus_slots != null
  ) {
    const total = Number(plan.pay_for_slots) + Number(plan.bonus_slots);
    return `${base} · Pague ${plan.pay_for_slots}, leve ${total}`;
  }
  return base;
}

function buildPlanBenefitFields(
  benefitType: BenefitType,
  discountPercent: string,
  discountFixed: string,
  payForSlots: string,
  bonusSlots: string,
) {
  const fields = {
    discount_percent: null as number | null,
    discount_fixed_amount: null as number | null,
    pay_for_slots: null as number | null,
    bonus_slots: null as number | null,
  };
  if (benefitType === 'discount_percent') {
    fields.discount_percent = Number(discountPercent || '0');
  }
  if (benefitType === 'discount_fixed') {
    fields.discount_fixed_amount = Number(discountFixed || '0');
  }
  if (benefitType === 'pay_x_get_y') {
    fields.pay_for_slots = Number(payForSlots || '0');
    fields.bonus_slots = Number(bonusSlots || '0');
  }
  return fields;
}
type ClientRow = { id: string; name: string };
type CourtRow = { id: string; name: string; slot_duration_minutes: number };

const DURATION_OPTIONS = [1, 3, 6, 9, 12] as const;
type ContractMode = 'single' | 'period';
type DurationMonths = (typeof DURATION_OPTIONS)[number];

type PeriodBatchItem = {
  reference_month: string;
  status: string;
  package_id?: string;
  error?: string;
  message?: string;
};

type PendingCheckout = {
  package_id: string;
  reference_month: string;
  total_amount?: number;
};

type PeriodBatchResult = {
  batch_id?: string;
  payment_method?: PaymentMethod;
  requested_months: number;
  created_count: number;
  skipped_count: number;
  failed_count: number;
  pending_checkouts?: PendingCheckout[];
  items: PeriodBatchItem[];
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

const CourtMonthlyPackagesPage: React.FC = () => {
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule, companyDetails } = useCourtBookingModule(primaryCompanyId);

  const monthlyEnabled = companyDetails?.court_enable_monthly_packages === true;
  const [loadingData, setLoadingData] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [courts, setCourts] = useState<CourtRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchFilter, setBatchFilter] = useState('all');
  const [periodPreview, setPeriodPreview] = useState<PeriodPreviewResult | null>(null);
  const [periodPreviewLoading, setPeriodPreviewLoading] = useState(false);
  const [cancellingBatch, setCancellingBatch] = useState(false);
  const [cancellingPackageId, setCancellingPackageId] = useState<string | null>(null);
  const [backfillingPackageId, setBackfillingPackageId] = useState<string | null>(null);
  const [backfillingAllCash, setBackfillingAllCash] = useState(false);
  const [complementingBatch, setComplementingBatch] = useState(false);
  const [mpCheckoutsOpen, setMpCheckoutsOpen] = useState(false);
  const [mpCheckouts, setMpCheckouts] = useState<PendingCheckout[]>([]);

  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [benefitType, setBenefitType] = useState<BenefitType>('discount_percent');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [discountFixed, setDiscountFixed] = useState('0');
  const [payForSlots, setPayForSlots] = useState('3');
  const [bonusSlots, setBonusSlots] = useState('1');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const todayMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const todayDow = useMemo(() => new Date().getDay().toString(), []);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedCourtId, setSelectedCourtId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('none');
  const [referenceMonth, setReferenceMonth] = useState(todayMonth);
  const [weekDay, setWeekDay] = useState(todayDow);
  const [startTime, setStartTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');
  const [notes, setNotes] = useState('');
  const [contractMode, setContractMode] = useState<ContractMode>('single');
  const [durationMonths, setDurationMonths] = useState<DurationMonths>(3);
  const [periodResultOpen, setPeriodResultOpen] = useState(false);
  const [periodResult, setPeriodResult] = useState<PeriodBatchResult | null>(null);

  const periodMonthLabels = useMemo(() => {
    if (contractMode !== 'period') return [];
    const [y, m] = referenceMonth.split('-').map(Number);
    if (!y || !m) return [];
    return Array.from({ length: durationMonths }, (_, i) => {
      const d = new Date(y, m - 1 + i, 1);
      return format(d, 'MMM/yyyy', { locale: ptBR });
    });
  }, [contractMode, referenceMonth, durationMonths]);

  const fetchPeriodPreview = useCallback(async () => {
    if (
      contractMode !== 'period' ||
      !primaryCompanyId ||
      !selectedClientId ||
      !selectedCourtId ||
      !referenceMonth
    ) {
      setPeriodPreview(null);
      return;
    }
    setPeriodPreviewLoading(true);
    try {
      const { data, error } = await supabase.rpc('preview_court_monthly_packages_period_internal', {
        p_company_id: primaryCompanyId,
        p_client_id: selectedClientId,
        p_court_id: selectedCourtId,
        p_start_month: `${referenceMonth}-01`,
        p_duration_months: durationMonths,
        p_week_day: Number(weekDay),
        p_start_time: startTime,
        p_duration_minutes: Number(durationMinutes),
      });
      if (error) throw error;
      const raw = data as PeriodPreviewResult & { months?: unknown };
      const monthsRaw = raw?.months;
      const months = Array.isArray(monthsRaw)
        ? (monthsRaw as PeriodPreviewResult['months'])
        : [];
      setPeriodPreview({
        requested_months: raw.requested_months ?? durationMonths,
        available_count: raw.available_count ?? 0,
        duplicate_count: raw.duplicate_count ?? 0,
        months,
      });
    } catch {
      setPeriodPreview(null);
    } finally {
      setPeriodPreviewLoading(false);
    }
  }, [
    contractMode,
    primaryCompanyId,
    selectedClientId,
    selectedCourtId,
    referenceMonth,
    durationMonths,
    weekDay,
    startTime,
    durationMinutes,
  ]);

  useEffect(() => {
    if (contractMode !== 'period') {
      setPeriodPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchPeriodPreview();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [contractMode, fetchPeriodPreview]);

  const loadData = useCallback(async () => {
    if (!primaryCompanyId || !session?.user || !monthlyEnabled) return;
    setLoadingData(true);
    try {
      const [plansRes, clientsRes, courtsRes, packagesRes, batchesRes] = await Promise.all([
        supabase
          .from('court_monthly_plans')
          .select(
            'id, name, benefit_type, is_active, description, discount_percent, discount_fixed_amount, pay_for_slots, bonus_slots',
          )
          .eq('company_id', primaryCompanyId)
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name').eq('company_id', primaryCompanyId).order('name', { ascending: true }),
        supabase.from('courts').select('id, name, slot_duration_minutes').eq('company_id', primaryCompanyId).eq('is_active', true).order('display_order', { ascending: true }),
        supabase
          .from('court_monthly_packages')
          .select(
            'id, created_at, reference_month, week_day, start_time, payment_method, payment_status, status, total_amount, discount_amount, occurrences_count, bonus_occurrences_count, batch_id, clients(name), courts(name), court_monthly_plans(name)',
          )
          .eq('company_id', primaryCompanyId)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('court_monthly_package_batches')
          .select(
            'id, created_at, start_month, duration_months, payment_method, created_count, skipped_count, failed_count, clients(name), courts(name)',
          )
          .eq('company_id', primaryCompanyId)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (plansRes.error) throw plansRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (courtsRes.error) throw courtsRes.error;
      if (packagesRes.error) throw packagesRes.error;
      if (batchesRes.error) throw batchesRes.error;

      const plansData = (plansRes.data || []) as PlanRow[];
      const clientsData = (clientsRes.data || []) as ClientRow[];
      const courtsData = (courtsRes.data || []) as CourtRow[];
      const packagesData = (packagesRes.data || []) as PackageRow[];
      const batchesData = (batchesRes.data || []) as BatchRow[];
      setPlans(plansData);
      setClients(clientsData);
      setCourts(courtsData);
      setPackages(packagesData);
      setBatches(batchesData);
      setSelectedClientId((prev) => (prev && clientsData.some((c) => c.id === prev) ? prev : clientsData[0]?.id || ''));
      setSelectedCourtId((prev) => (prev && courtsData.some((c) => c.id === prev) ? prev : courtsData[0]?.id || ''));
      if (!durationMinutes || durationMinutes === '60') setDurationMinutes(String(courtsData[0]?.slot_duration_minutes ?? 60));
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao carregar dados de pacotes mensais.');
    } finally {
      setLoadingData(false);
    }
  }, [primaryCompanyId, session?.user, monthlyEnabled, durationMinutes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetPlanForm = () => {
    setEditingPlanId(null);
    setPlanName('');
    setPlanDescription('');
    setBenefitType('discount_percent');
    setDiscountPercent('10');
    setDiscountFixed('0');
    setPayForSlots('3');
    setBonusSlots('1');
  };

  const startEditPlan = (plan: PlanRow) => {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setPlanDescription(plan.description || '');
    setBenefitType(plan.benefit_type);
    setDiscountPercent(String(plan.discount_percent ?? '10'));
    setDiscountFixed(String(plan.discount_fixed_amount ?? '0'));
    setPayForSlots(String(plan.pay_for_slots ?? '3'));
    setBonusSlots(String(plan.bonus_slots ?? '1'));
  };

  const savePlan = async () => {
    if (!primaryCompanyId || !session?.user) return;
    if (!planName.trim()) return showError('Informe o nome do plano.');
    setSavingPlan(true);
    try {
      const benefitFields = buildPlanBenefitFields(
        benefitType,
        discountPercent,
        discountFixed,
        payForSlots,
        bonusSlots,
      );
      if (editingPlanId) {
        const { error } = await supabase
          .from('court_monthly_plans')
          .update({
            name: planName.trim(),
            description: planDescription.trim() || null,
            benefit_type: benefitType,
            ...benefitFields,
          })
          .eq('id', editingPlanId)
          .eq('company_id', primaryCompanyId);
        if (error) throw error;
        showSuccess('Plano mensal atualizado.');
        resetPlanForm();
      } else {
        const { error } = await supabase.from('court_monthly_plans').insert({
          company_id: primaryCompanyId,
          name: planName.trim(),
          description: planDescription.trim() || null,
          benefit_type: benefitType,
          created_by_user_id: session.user.id,
          ...benefitFields,
        });
        if (error) throw error;
        showSuccess('Plano mensal criado.');
        setPlanName('');
        setPlanDescription('');
      }
      await loadData();
    } catch (e: unknown) {
      showError(
        e instanceof Error
          ? e.message
          : editingPlanId
            ? 'Erro ao atualizar plano mensal.'
            : 'Erro ao criar plano mensal.',
      );
    } finally {
      setSavingPlan(false);
    }
  };

  const togglePlan = async (plan: PlanRow) => {
    const { error } = await supabase.from('court_monthly_plans').update({ is_active: !plan.is_active }).eq('id', plan.id);
    if (error) return showError(error.message);
    showSuccess(plan.is_active ? 'Plano inativado.' : 'Plano ativado.');
    await loadData();
  };

  const openPackageCheckout = async (packageId: string) => {
    const payload = await invokeEdgeWithAuthOrThrow<{ init_point?: string }>('create-court-monthly-package-checkout', {
      body: { package_id: packageId },
    });
    if (!payload?.init_point) throw new Error('Checkout sem init_point.');
    window.location.href = payload.init_point;
  };

  const buildPackagePayload = (selectedClient: ClientRow | undefined) => ({
    p_company_id: primaryCompanyId!,
    p_client_id: selectedClientId,
    p_client_nickname: selectedClient?.name || null,
    p_court_id: selectedCourtId,
    p_week_day: Number(weekDay),
    p_start_time: startTime,
    p_duration_minutes: Number(durationMinutes),
    p_plan_id: selectedPlanId === 'none' ? null : selectedPlanId,
    p_notes: notes.trim() || null,
  });

  const formatReferenceMonthLabel = (ref: string) => {
    const raw = String(ref).slice(0, 10);
    const d = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return format(d, 'MMM/yyyy', { locale: ptBR });
  };

  const periodItemLabel = (item: PeriodBatchItem) => {
    const month = formatReferenceMonthLabel(item.reference_month);
    if (item.status === 'created') return `${month}: criado`;
    if (item.status === 'skipped_duplicate') return `${month}: já existia (ignorado)`;
    return `${month}: falhou — ${item.error || item.message || 'erro desconhecido'}`;
  };

  const formatBatchLabel = useCallback((batch: BatchRow) => {
    const start = formatReferenceMonthLabel(String(batch.start_month).slice(0, 10));
    const client = batch.clients?.name ?? 'Cliente';
    const court = batch.courts?.name ?? 'Quadra';
    const when = format(new Date(batch.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    return `${when} · ${client} · ${court} · ${start} (${batch.duration_months}m, ${batch.created_count} criados)`;
  }, []);

  const selectedBatch = useMemo(
    () => (batchFilter === 'all' ? null : batches.find((b) => b.id === batchFilter) ?? null),
    [batchFilter, batches],
  );

  const handleBackfillCashReceipt = async (packageId: string) => {
    setBackfillingPackageId(packageId);
    try {
      const { data, error } = await supabase.rpc('backfill_court_monthly_package_cash_receipt_internal', {
        p_package_id: packageId,
      });
      if (error) throw error;
      const payload = data as { created?: boolean; message?: string; total_amount?: number };
      if (payload.created) {
        showSuccess(
          payload.message ||
            `Recebimento de R$ ${Number(payload.total_amount || 0).toFixed(2).replace('.', ',')} registrado no financeiro.`,
        );
      } else {
        showSuccess(payload.message || 'Recebimento já estava registrado no financeiro.');
      }
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao regularizar recebimento.');
    } finally {
      setBackfillingPackageId(null);
    }
  };

  const handleBackfillAllCashReceipts = async () => {
    if (!primaryCompanyId) return;
    if (
      !window.confirm(
        'Regularizar recebimentos no financeiro de todos os pacotes em dinheiro já pagos desta empresa que ainda não têm lançamento?',
      )
    ) {
      return;
    }
    setBackfillingAllCash(true);
    try {
      const { data, error } = await supabase.rpc(
        'backfill_court_monthly_packages_cash_for_company_internal',
        { p_company_id: primaryCompanyId },
      );
      if (error) throw error;
      const payload = data as { created?: number; skipped_already_exists?: number; failed?: number };
      showSuccess(
        `${payload.created ?? 0} recebimento(s) criado(s).` +
          (payload.skipped_already_exists ? ` ${payload.skipped_already_exists} já existiam.` : '') +
          (payload.failed ? ` ${payload.failed} falha(s).` : ''),
      );
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao regularizar recebimentos.');
    } finally {
      setBackfillingAllCash(false);
    }
  };

  const handleCancelPackage = async (packageId: string) => {
    if (
      !window.confirm(
        'Cancelar este pacote mensal e os agendamentos vinculados (exceto já concluídos)? O recebimento em dinheiro será estornado no financeiro.',
      )
    ) {
      return;
    }
    setCancellingPackageId(packageId);
    try {
      const { data, error } = await supabase.rpc('cancel_court_monthly_package_internal', {
        p_package_id: packageId,
        p_cancellation_reason: 'Cancelamento pelo painel administrativo.',
      });
      if (error) throw error;
      const payload = data as {
        cancelled_appointments?: number;
        cash_receipt_reversed?: boolean;
        mp_paid_warning?: string | null;
        already_cancelled?: boolean;
      };
      if (payload.already_cancelled) {
        showSuccess('Pacote já estava cancelado.');
      } else {
        showSuccess(
          `Pacote cancelado.${payload.cancelled_appointments ? ` ${payload.cancelled_appointments} agendamento(s) cancelado(s).` : ''}${
            payload.cash_receipt_reversed ? ' Estorno registrado no financeiro.' : ''
          }`,
        );
      }
      if (payload.mp_paid_warning) showError(payload.mp_paid_warning);
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao cancelar pacote.');
    } finally {
      setCancellingPackageId(null);
    }
  };

  const handleCancelBatch = async () => {
    if (!batchFilter || batchFilter === 'all') return;
    if (!window.confirm('Cancelar todos os pacotes ativos deste lote e os agendamentos vinculados?')) return;
    setCancellingBatch(true);
    try {
      const { data, error } = await supabase.rpc('cancel_court_monthly_package_batch_internal', {
        p_batch_id: batchFilter,
        p_cancellation_reason: 'Cancelamento em lote pelo painel administrativo.',
      });
      if (error) throw error;
      const payload = data as { cancelled_packages?: number; mp_paid_warning?: string | null };
      showSuccess(`${payload.cancelled_packages ?? 0} pacote(s) cancelado(s) no lote.`);
      if (payload.mp_paid_warning) showError(payload.mp_paid_warning);
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao cancelar lote.');
    } finally {
      setCancellingBatch(false);
    }
  };

  const handleComplementBatch = async () => {
    if (!batchFilter || batchFilter === 'all') return;
    const selectedClient = clients.find((c) => c.id === selectedClientId);
    setComplementingBatch(true);
    try {
      const { data, error } = await supabase.rpc('complement_court_monthly_package_batch_internal', {
        p_batch_id: batchFilter,
        p_client_nickname: selectedClient?.name ?? null,
      });
      if (error) throw error;
      const result = data as PeriodBatchResult;
      setPeriodResult(result);
      setPeriodResultOpen(true);
      if (result.created_count > 0) {
        showSuccess(`${result.created_count} pacote(s) complementar(es) criado(s).`);
      } else {
        showError('Nenhum mês novo foi criado (todos já existiam ou falharam).');
      }
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao complementar lote.');
    } finally {
      setComplementingBatch(false);
    }
  };

  const createPackage = async () => {
    if (!primaryCompanyId || !selectedClientId || !selectedCourtId) return showError('Selecione cliente e quadra.');
    const selectedClient = clients.find((c) => c.id === selectedClientId);

    if (contractMode === 'period') {
      setSavingPackage(true);
      try {
        const { data, error } = await supabase.rpc('create_court_monthly_packages_for_period_internal', {
          ...buildPackagePayload(selectedClient),
          p_start_month: `${referenceMonth}-01`,
          p_duration_months: durationMonths,
          p_payment_method: paymentMethod,
        });
        if (error) throw error;
        const result = data as PeriodBatchResult;
        setPeriodResult(result);
        setPeriodResultOpen(true);
        if (result.batch_id) setBatchFilter(result.batch_id);
        const pending = Array.isArray(result.pending_checkouts) ? result.pending_checkouts : [];
        if (paymentMethod === 'mercado_pago' && pending.length > 0) {
          setMpCheckouts(pending);
          setMpCheckoutsOpen(true);
        }
        if (result.created_count > 0) {
          showSuccess(
            `${result.created_count} pacote(s) criado(s).` +
              (result.skipped_count ? ` ${result.skipped_count} ignorado(s).` : '') +
              (result.failed_count ? ` ${result.failed_count} com falha.` : ''),
          );
        } else if (result.failed_count > 0) {
          showError('Nenhum pacote foi criado. Veja o detalhe por mês.');
        } else {
          showError('Nenhum pacote novo: todos os meses já tinham contrato equivalente.');
        }
        await loadData();
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : 'Erro ao gerar pacotes do período.');
      } finally {
        setSavingPackage(false);
      }
      return;
    }

    setSavingPackage(true);
    try {
      const { data, error } = await supabase.rpc('create_court_monthly_package_internal', {
        ...buildPackagePayload(selectedClient),
        p_reference_month: `${referenceMonth}-01`,
        p_payment_method: paymentMethod,
      });
      if (error) throw error;
      const packageId = String((data as { package_id?: string } | null)?.package_id || '');
      showSuccess('Pacote mensal criado com sucesso.');
      if (paymentMethod === 'mercado_pago' && packageId) await openPackageCheckout(packageId);
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao criar pacote mensal.');
    } finally {
      setSavingPackage(false);
    }
  };

  if (loadingPrimaryCompany || loadingSchedulingMode || loadingArenaModule) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...</div>;
  if (!session?.user) return <Navigate to="/login" replace />;
  if (!isCourtMode || !canUseArenaManagement) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <ArenaPageHeader
        title="Pacotes mensais da arena"
        actions={
          <ArenaToolbar
            back={{ to: '/quadras', label: 'Quadras' }}
            links={getArenaModuleLinks(true)}
            trailing={
              <Button
                variant="default"
                type="button"
                className={cn(arenaToolbarBtnClass, arenaToolbarSolidClass, arenaTouchButtonClass, 'w-full md:w-auto')}
                onClick={loadData}
                disabled={loadingData}
              >
                {loadingData ? 'Atualizando...' : 'Atualizar'}
              </Button>
            }
          />
        }
      />
      {!monthlyEnabled ? (
        <Card><CardHeader><CardTitle>Módulo de pacotes mensais desativado</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-gray-700"><p>Ative em Configurações para liberar a rotina interna de pacotes mensais.</p><Button asChild className="!rounded-button"><Link to="/config">Ir para Configurações</Link></Button></CardContent></Card>
      ) : (
        <>
          <Card><CardHeader><CardTitle className={arenaSectionTitleClass}>Planos mensais (regras comerciais)</CardTitle></CardHeader><CardContent className="space-y-4">
              {editingPlanId ? (
                <p className="text-sm text-muted-foreground">
                  Editando plano — altere os campos abaixo e salve, ou cancele para voltar à criação.
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2"><div><Label className={arenaLabelClass}>Nome do plano</Label><Input className={arenaTouchInputClass} value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Ex.: Mensal 10% OFF" /></div><div><Label className={arenaLabelClass}>Tipo de benefício</Label><Select value={benefitType} onValueChange={(v) => setBenefitType(v as BenefitType)}><SelectTrigger className={arenaTouchInputClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="discount_percent">Desconto percentual</SelectItem><SelectItem value="discount_fixed">Desconto fixo (R$)</SelectItem><SelectItem value="pay_x_get_y">Pague X e leve Y</SelectItem></SelectContent></Select></div>{benefitType === 'discount_percent' ? <div><Label className={arenaLabelClass}>Desconto (%)</Label><Input className={arenaTouchInputClass} type="number" min={0} max={100} step="0.01" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} /></div> : null}{benefitType === 'discount_fixed' ? <div><Label className={arenaLabelClass}>Desconto fixo (R$)</Label><Input className={arenaTouchInputClass} type="number" min={0} step="0.01" value={discountFixed} onChange={(e) => setDiscountFixed(e.target.value)} /></div> : null}{benefitType === 'pay_x_get_y' ? <><div><Label className={arenaLabelClass}>Paga quantos horários (X)</Label><Input className={arenaTouchInputClass} type="number" min={1} step="1" value={payForSlots} onChange={(e) => setPayForSlots(e.target.value)} /></div><div><Label className={arenaLabelClass}>Ganha quantos horários (Y)</Label><Input className={arenaTouchInputClass} type="number" min={1} step="1" value={bonusSlots} onChange={(e) => setBonusSlots(e.target.value)} /></div></> : null}</div><div><Label className={arenaLabelClass}>Descrição (opcional)</Label><Textarea className="mt-1 min-h-[88px] text-base" rows={3} value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} /></div><Button className={cn('w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 !rounded-button', arenaTouchButtonClass)} disabled={savingPlan} onClick={savePlan}>{savingPlan ? 'Salvando...' : editingPlanId ? 'Salvar alterações' : 'Criar plano'}</Button>{editingPlanId ? <Button variant="outline" className={cn('!rounded-button mt-2 sm:mt-0 sm:ml-2 w-full sm:w-auto', arenaTouchButtonClass)} disabled={savingPlan} onClick={resetPlanForm}>Cancelar</Button> : null}<div className="space-y-3">{plans.map((p) => <div key={p.id} className={cn('flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between', editingPlanId === p.id && 'border-primary ring-1 ring-primary/30')}><div><p className="text-lg font-semibold text-gray-900 dark:text-white">{p.name}</p><p className="text-sm text-gray-600 dark:text-gray-400">{formatPlanBenefitSummary(p)}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'Ativo' : 'Inativo'}</Badge><Button variant="outline" className={arenaTouchButtonClass} onClick={() => startEditPlan(p)}>Alterar</Button><Button variant="outline" className={arenaTouchButtonClass} onClick={() => togglePlan(p)}>{p.is_active ? 'Inativar' : 'Ativar'}</Button></div></div>)}</div></CardContent></Card>

                    <CourtMonthlyPackageCreateCard
            contractMode={contractMode}
            onContractModeChange={setContractMode}
            durationMonths={durationMonths}
            onDurationMonthsChange={setDurationMonths}
            periodMonthLabels={periodMonthLabels}
            periodPreview={periodPreview}
            periodPreviewLoading={periodPreviewLoading}
            formatMonthLabel={formatReferenceMonthLabel}
            todayMonth={todayMonth}
            clients={clients}
            courts={courts}
            plans={plans}
            selectedClientId={selectedClientId}
            onSelectedClientIdChange={setSelectedClientId}
            selectedCourtId={selectedCourtId}
            onSelectedCourtIdChange={setSelectedCourtId}
            referenceMonth={referenceMonth}
            onReferenceMonthChange={setReferenceMonth}
            weekDay={weekDay}
            onWeekDayChange={setWeekDay}
            startTime={startTime}
            onStartTimeChange={setStartTime}
            durationMinutes={durationMinutes}
            onDurationMinutesChange={setDurationMinutes}
            selectedPlanId={selectedPlanId}
            onSelectedPlanIdChange={setSelectedPlanId}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            notes={notes}
            onNotesChange={setNotes}
            savingPackage={savingPackage}
            onSubmit={createPackage}
          />

          <Dialog open={periodResultOpen} onOpenChange={setPeriodResultOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Resultado da geração em lote</DialogTitle>
                <DialogDescription>
                  {periodResult
                    ? `${periodResult.created_count} criado(s), ${periodResult.skipped_count} ignorado(s), ${periodResult.failed_count} falha(s).${periodResult.batch_id ? ' Lote registrado — use o filtro na lista abaixo.' : ''}`
                    : ''}
                </DialogDescription>
              </DialogHeader>
              <ul className="text-sm space-y-1 list-disc pl-4">
                {(Array.isArray(periodResult?.items) ? periodResult.items : []).map((item, idx) => (
                  <li key={`${item.reference_month}-${idx}`}>{periodItemLabel(item)}</li>
                ))}
              </ul>
              <DialogFooter>
                <Button type="button" onClick={() => setPeriodResultOpen(false)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={mpCheckoutsOpen} onOpenChange={setMpCheckoutsOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Checkouts Mercado Pago do lote</DialogTitle>
                <DialogDescription>
                  Abra o pagamento de cada mês. Os agendamentos só são confirmados após aprovação do pagamento.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm">
                {mpCheckouts.map((row) => (
                  <li
                    key={row.package_id}
                    className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-2"
                  >
                    <span>
                      {formatReferenceMonthLabel(String(row.reference_month).slice(0, 10))}
                      {row.total_amount != null
                        ? ` · R$ ${Number(row.total_amount).toFixed(2).replace('.', ',')}`
                        : ''}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void openPackageCheckout(row.package_id)}
                    >
                      Abrir checkout
                    </Button>
                  </li>
                ))}
              </ul>
              <DialogFooter>
                <Button type="button" onClick={() => setMpCheckoutsOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {selectedBatch ? (
            <CourtMonthlyPackageBatchPanel
              batch={selectedBatch}
              packages={packages}
              formatMonthLabel={formatReferenceMonthLabel}
              onCancelBatch={() => void handleCancelBatch()}
              onComplementBatch={() => void handleComplementBatch()}
              onOpenCheckout={(id) => void openPackageCheckout(id)}
              cancelling={cancellingBatch}
              complementing={complementingBatch}
            />
          ) : null}

          <CourtMonthlyPackageRecentList
            packages={packages}
            batches={batches}
            batchFilter={batchFilter}
            onBatchFilterChange={setBatchFilter}
            formatBatchLabel={formatBatchLabel}
            onOpenCheckout={openPackageCheckout}
            onCancelPackage={(id) => void handleCancelPackage(id)}
            cancellingPackageId={cancellingPackageId}
            onBackfillCashReceipt={(id) => void handleBackfillCashReceipt(id)}
            backfillingPackageId={backfillingPackageId}
            onBackfillAllCashReceipts={() => void handleBackfillAllCashReceipts()}
            backfillingAll={backfillingAllCash}
          />
        </>
      )}
    </div>
  );
};

export default CourtMonthlyPackagesPage;
