import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
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
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import ArenaToolbar, {
  arenaToolbarBtnClass,
  arenaToolbarSolidClass,
} from '@/components/arena/ArenaToolbar';
import { getArenaModuleLinks } from '@/components/arena/arenaNavConfig';

type BenefitType = 'discount_percent' | 'discount_fixed' | 'pay_x_get_y';
type PaymentMethod = 'dinheiro' | 'mercado_pago';

type PlanRow = { id: string; name: string; benefit_type: BenefitType; is_active: boolean };
type PackageRow = {
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
  clients?: { name?: string } | null;
  courts?: { name?: string } | null;
  court_monthly_plans?: { name?: string } | null;
};
type ClientRow = { id: string; name: string };
type CourtRow = { id: string; name: string; slot_duration_minutes: number };

const WEEK_DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

function parseEdgeInvokeError(response: { error?: { message?: string; context?: { data?: unknown } }; data?: unknown }): string {
  if (response.error) return response.error.message || 'Erro na Edge Function.';
  if (response.data && typeof response.data === 'object' && response.data !== null && 'error' in response.data) {
    return String((response.data as { error?: string }).error || 'Erro na Edge Function.');
  }
  return 'Erro na Edge Function.';
}

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

  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [benefitType, setBenefitType] = useState<BenefitType>('discount_percent');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [discountFixed, setDiscountFixed] = useState('0');
  const [payForSlots, setPayForSlots] = useState('3');
  const [bonusSlots, setBonusSlots] = useState('1');

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

  const loadData = useCallback(async () => {
    if (!primaryCompanyId || !session?.user || !monthlyEnabled) return;
    setLoadingData(true);
    try {
      const [plansRes, clientsRes, courtsRes, packagesRes] = await Promise.all([
        supabase.from('court_monthly_plans').select('id, name, benefit_type, is_active').eq('company_id', primaryCompanyId).order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name').eq('company_id', primaryCompanyId).order('name', { ascending: true }),
        supabase.from('courts').select('id, name, slot_duration_minutes').eq('company_id', primaryCompanyId).eq('is_active', true).order('display_order', { ascending: true }),
        supabase.from('court_monthly_packages').select('id, created_at, reference_month, week_day, start_time, payment_method, payment_status, status, total_amount, discount_amount, occurrences_count, bonus_occurrences_count, clients(name), courts(name), court_monthly_plans(name)').eq('company_id', primaryCompanyId).order('created_at', { ascending: false }).limit(30),
      ]);
      if (plansRes.error) throw plansRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (courtsRes.error) throw courtsRes.error;
      if (packagesRes.error) throw packagesRes.error;

      const plansData = (plansRes.data || []) as PlanRow[];
      const clientsData = (clientsRes.data || []) as ClientRow[];
      const courtsData = (courtsRes.data || []) as CourtRow[];
      const packagesData = (packagesRes.data || []) as PackageRow[];
      setPlans(plansData);
      setClients(clientsData);
      setCourts(courtsData);
      setPackages(packagesData);
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

  const createPlan = async () => {
    if (!primaryCompanyId || !session?.user) return;
    if (!planName.trim()) return showError('Informe o nome do plano.');
    setSavingPlan(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: primaryCompanyId,
        name: planName.trim(),
        description: planDescription.trim() || null,
        benefit_type: benefitType,
        created_by_user_id: session.user.id,
        discount_percent: null,
        discount_fixed_amount: null,
        pay_for_slots: null,
        bonus_slots: null,
      };
      if (benefitType === 'discount_percent') payload.discount_percent = Number(discountPercent || '0');
      if (benefitType === 'discount_fixed') payload.discount_fixed_amount = Number(discountFixed || '0');
      if (benefitType === 'pay_x_get_y') {
        payload.pay_for_slots = Number(payForSlots || '0');
        payload.bonus_slots = Number(bonusSlots || '0');
      }
      const { error } = await supabase.from('court_monthly_plans').insert(payload);
      if (error) throw error;
      showSuccess('Plano mensal criado.');
      setPlanName('');
      setPlanDescription('');
      await loadData();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Erro ao criar plano mensal.');
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
    const response = await supabase.functions.invoke('create-court-monthly-package-checkout', {
      body: JSON.stringify({ package_id: packageId }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    });
    if (response.error || (response.data && typeof response.data === 'object' && 'error' in response.data)) {
      throw new Error(parseEdgeInvokeError(response));
    }
    const payload = response.data as { init_point?: string };
    if (!payload?.init_point) throw new Error('Checkout sem init_point.');
    window.location.href = payload.init_point;
  };

  const createPackage = async () => {
    if (!primaryCompanyId || !selectedClientId || !selectedCourtId) return showError('Selecione cliente e quadra.');
    setSavingPackage(true);
    try {
      const selectedClient = clients.find((c) => c.id === selectedClientId);
      const payload = {
        p_company_id: primaryCompanyId,
        p_client_id: selectedClientId,
        p_client_nickname: selectedClient?.name || null,
        p_court_id: selectedCourtId,
        p_reference_month: `${referenceMonth}-01`,
        p_week_day: Number(weekDay),
        p_start_time: startTime,
        p_duration_minutes: Number(durationMinutes),
        p_plan_id: selectedPlanId === 'none' ? null : selectedPlanId,
        p_payment_method: paymentMethod,
        p_notes: notes.trim() || null,
      };
      const { data, error } = await supabase.rpc('create_court_monthly_package_internal', payload);
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
                size="sm"
                type="button"
                className={cn(arenaToolbarBtnClass, arenaToolbarSolidClass)}
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
          <Card><CardHeader><CardTitle>Planos mensais (regras comerciais)</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div><Label>Nome do plano</Label><Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Ex.: Mensal 10% OFF" /></div><div><Label>Tipo de benefício</Label><Select value={benefitType} onValueChange={(v) => setBenefitType(v as BenefitType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="discount_percent">Desconto percentual</SelectItem><SelectItem value="discount_fixed">Desconto fixo (R$)</SelectItem><SelectItem value="pay_x_get_y">Pague X e leve Y</SelectItem></SelectContent></Select></div>{benefitType === 'discount_percent' ? <div><Label>Desconto (%)</Label><Input type="number" min={0} max={100} step="0.01" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} /></div> : null}{benefitType === 'discount_fixed' ? <div><Label>Desconto fixo (R$)</Label><Input type="number" min={0} step="0.01" value={discountFixed} onChange={(e) => setDiscountFixed(e.target.value)} /></div> : null}{benefitType === 'pay_x_get_y' ? <><div><Label>Paga quantos horários (X)</Label><Input type="number" min={1} step="1" value={payForSlots} onChange={(e) => setPayForSlots(e.target.value)} /></div><div><Label>Ganha quantos horários (Y)</Label><Input type="number" min={1} step="1" value={bonusSlots} onChange={(e) => setBonusSlots(e.target.value)} /></div></> : null}</div><div><Label>Descrição (opcional)</Label><Textarea rows={2} value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} /></div><Button className="bg-primary text-primary-foreground hover:bg-primary/90 !rounded-button" disabled={savingPlan} onClick={createPlan}>{savingPlan ? 'Salvando...' : 'Criar plano'}</Button><div className="space-y-2">{plans.map((p) => <div key={p.id} className="flex items-center justify-between border rounded-md px-3 py-2"><div className="text-sm"><p className="font-medium">{p.name}</p><p className="text-gray-500">{p.benefit_type}</p></div><div className="flex items-center gap-2"><Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'Ativo' : 'Inativo'}</Badge><Button variant="outline" size="sm" onClick={() => togglePlan(p)}>{p.is_active ? 'Inativar' : 'Ativar'}</Button></div></div>)}</div></CardContent></Card>

          <Card><CardHeader><CardTitle>Criar pacote mensal</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div><Label>Cliente</Label><Select value={selectedClientId} onValueChange={setSelectedClientId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Quadra</Label><Select value={selectedCourtId} onValueChange={(v) => { setSelectedCourtId(v); const court = courts.find((c) => c.id === v); if (court) setDurationMinutes(String(court.slot_duration_minutes || 60)); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{courts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Mês de referência</Label><Input type="month" value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)} /></div><div><Label>Dia da semana</Label><Select value={weekDay} onValueChange={setWeekDay}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WEEK_DAYS.map((w) => <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Horário</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div><div><Label>Duração (min)</Label><Input type="number" min={15} max={1440} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} /></div><div><Label>Plano (opcional)</Label><Select value={selectedPlanId} onValueChange={setSelectedPlanId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem plano (valor cheio)</SelectItem>{plans.filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Forma de pagamento</Label><Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dinheiro">Pago no balcão (interno)</SelectItem><SelectItem value="mercado_pago">Pagamento online (Mercado Pago)</SelectItem></SelectContent></Select></div></div><div><Label>Observações</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div><Button className="bg-primary text-primary-foreground hover:bg-primary/90 !rounded-button" disabled={savingPackage} onClick={createPackage}>{savingPackage ? 'Criando pacote...' : 'Criar pacote mensal'}</Button></CardContent></Card>

          <Card><CardHeader><CardTitle>Pacotes mensais recentes</CardTitle></CardHeader><CardContent>{packages.length === 0 ? <p className="text-sm text-gray-600">Nenhum pacote mensal criado ainda.</p> : <div className="space-y-2">{packages.map((pkg) => <div key={pkg.id} className="border rounded-md p-3 text-sm space-y-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{pkg.clients?.name || 'Cliente'} · {pkg.courts?.name || 'Quadra'} · {String(pkg.reference_month).slice(0, 7)}</p><div className="flex gap-2"><Badge variant="outline">{pkg.payment_method}</Badge><Badge variant="secondary">{pkg.payment_status}</Badge><Badge>{pkg.status}</Badge></div></div><p>Plano: {pkg.court_monthly_plans?.name || 'Sem plano'} · Dia {WEEK_DAYS.find((w) => w.value === pkg.week_day)?.label} às {String(pkg.start_time).slice(0, 5)}</p><p>Total: R$ {Number(pkg.total_amount || 0).toFixed(2).replace('.', ',')} · Desconto: R$ {Number(pkg.discount_amount || 0).toFixed(2).replace('.', ',')} · Ocorrências: {pkg.occurrences_count} ({pkg.bonus_occurrences_count} bônus)</p>{pkg.payment_method === 'mercado_pago' && pkg.status === 'pending_payment' ? <Button size="sm" variant="outline" onClick={() => openPackageCheckout(pkg.id)}>Abrir checkout</Button> : null}</div>)}</div>}</CardContent></Card>
        </>
      )}
    </div>
  );
};

export default CourtMonthlyPackagesPage;
