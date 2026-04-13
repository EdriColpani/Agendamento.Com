import React, { useState, useEffect, useCallback } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import { ArrowLeft } from 'lucide-react';

const DAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

interface CourtOption {
  id: string;
  name: string;
  slot_duration_minutes: number;
}

interface DayForm {
  active: boolean;
  start: string;
  end: string;
}

function toTimeInput(pgTime: string): string {
  if (!pgTime) return '';
  return pgTime.slice(0, 5);
}

function toPgTime(html: string): string {
  if (!html) return '00:00:00';
  return html.length === 5 ? `${html}:00` : html;
}

const CourtWorkingHoursPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [courtId, setCourtId] = useState<string>('');
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [days, setDays] = useState<DayForm[]>(() =>
    Array.from({ length: 7 }, () => ({ active: false, start: '08:00', end: '22:00' })),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCourts = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('courts')
      .select('id, name, slot_duration_minutes')
      .eq('company_id', primaryCompanyId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) {
      showError('Erro ao carregar quadras: ' + error.message);
      setCourts([]);
      return;
    }
    const rows = (data as CourtOption[]) || [];
    setCourts(rows);
    setCourtId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      return rows[0]?.id ?? '';
    });
  }, [primaryCompanyId]);

  const loadHours = useCallback(async () => {
    if (!courtId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('court_working_hours')
      .select('day_of_week, start_time, end_time, is_active')
      .eq('court_id', courtId);

    if (error) {
      showError('Erro ao carregar horários: ' + error.message);
      setLoading(false);
      return;
    }

    const next = Array.from({ length: 7 }, (_, d) => ({ active: false, start: '08:00', end: '22:00' }));
    for (const row of data || []) {
      const d = row.day_of_week as number;
      if (d >= 0 && d <= 6) {
        next[d] = {
          active: row.is_active !== false,
          start: toTimeInput(row.start_time as string),
          end: toTimeInput(row.end_time as string),
        };
      }
    }
    setDays(next);

    const { data: cRow } = await supabase
      .from('courts')
      .select('slot_duration_minutes')
      .eq('id', courtId)
      .maybeSingle();
    if (cRow?.slot_duration_minutes) setSlotMinutes(cRow.slot_duration_minutes);

    setLoading(false);
  }, [courtId]);

  useEffect(() => {
    if (primaryCompanyId && isCourtMode && canUseArenaManagement) loadCourts();
  }, [primaryCompanyId, isCourtMode, canUseArenaManagement, loadCourts]);

  useEffect(() => {
    if (courtId) loadHours();
  }, [courtId, loadHours]);

  const updateDay = (d: number, patch: Partial<DayForm>) => {
    setDays((prev) => prev.map((row, i) => (i === d ? { ...row, ...patch } : row)));
  };

  const handleSave = async () => {
    if (!courtId || !primaryCompanyId) return;
    setSaving(true);
    try {
      const { error: courtErr } = await supabase
        .from('courts')
        .update({ slot_duration_minutes: slotMinutes })
        .eq('id', courtId)
        .eq('company_id', primaryCompanyId);
      if (courtErr) throw courtErr;

      for (let d = 0; d < 7; d++) {
        const row = days[d];
        if (row.active && row.start && row.end && row.start < row.end) {
          const { error } = await supabase.from('court_working_hours').upsert(
            {
              court_id: courtId,
              day_of_week: d,
              start_time: toPgTime(row.start),
              end_time: toPgTime(row.end),
              is_active: true,
            },
            { onConflict: 'court_id,day_of_week' },
          );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('court_working_hours')
            .delete()
            .eq('court_id', courtId)
            .eq('day_of_week', d);
          if (error) throw error;
        }
      }
      showSuccess('Horários salvos.');
      loadHours();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showError('Erro ao salvar: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  if (loadingPrimaryCompany || loadingSchedulingMode || loadingArenaModule) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700 dark:text-gray-300">Carregando...</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa estar logado.</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 mb-4">É necessário ter uma empresa primária.</p>
        <Button onClick={() => navigate('/register-company')}>Cadastrar empresa</Button>
      </div>
    );
  }

  if (!isCourtMode) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!canUseArenaManagement) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Módulo de quadras indisponível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <p>O módulo de quadras não está habilitado para o seu plano ou foi desativado na empresa.</p>
            <Button className="!rounded-button" variant="outline" onClick={() => navigate('/dashboard')}>
              Voltar ao dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" className="!rounded-button" asChild>
          <Link to="/quadras">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar às quadras
          </Link>
        </Button>
        <Button variant="outline" className="!rounded-button" asChild>
          <Link to="/quadras/agenda">Ver agenda do dia</Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Horários de funcionamento</h1>

      {courts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600 dark:text-gray-400">Cadastre ao menos uma quadra ativa em Quadras.</p>
            <Button className="mt-4" asChild>
              <Link to="/quadras">Ir para Quadras</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Configuração por quadra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Quadra</Label>
                <Select value={courtId} onValueChange={(v) => setCourtId(v)}>
                  <SelectTrigger className="mt-1">
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
                <Label>Duração do slot (minutos)</Label>
                <Input
                  type="number"
                  min={15}
                  max={720}
                  className="mt-1"
                  value={slotMinutes}
                  onChange={(e) => setSlotMinutes(parseInt(e.target.value, 10) || 60)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ex.: 60 para reservas de 1 hora. Usado na grade da agenda.
                </p>
              </div>
            </div>

            {loading ? (
              <p className="text-gray-600">Carregando horários...</p>
            ) : (
              <div className="space-y-4">
                {DAY_LABELS.map((label, d) => (
                  <div
                    key={d}
                    className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <Switch
                        checked={days[d].active}
                        onCheckedChange={(v) => updateDay(d, { active: v })}
                      />
                      <span className="font-medium text-gray-900 dark:text-white">{label}</span>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <Label className="text-xs">Abertura</Label>
                        <Input
                          type="time"
                          className="mt-1 w-36"
                          disabled={!days[d].active}
                          value={days[d].start}
                          onChange={(e) => updateDay(d, { start: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Encerramento</Label>
                        <Input
                          type="time"
                          className="mt-1 w-36"
                          disabled={!days[d].active}
                          value={days[d].end}
                          onChange={(e) => updateDay(d, { end: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              className="bg-yellow-600 hover:bg-yellow-700 text-black"
              disabled={saving || !courtId}
              onClick={handleSave}
            >
              {saving ? 'Salvando...' : 'Salvar horários'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CourtWorkingHoursPage;
