import React, { useState, useEffect, useCallback } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCompanySchedulingMode } from '@/hooks/useCompanySchedulingMode';
import { useCourtBookingModule } from '@/hooks/useCourtBookingModule';
import { ArrowLeft, Trash2 } from 'lucide-react';

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface CourtOption {
  id: string;
  name: string;
}

interface BandRow {
  id: string;
  court_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_price: number;
  sort_order: number;
}

function toPgTime(val: string): string {
  const t = val.trim();
  if (!t) return '00:00:00';
  return t.length <= 5 ? `${t}:00` : t;
}

function formatTimeLabel(pg: string): string {
  return pg?.slice(0, 5) ?? '';
}

const CourtSlotPriceBandsPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCourtMode, loading: loadingSchedulingMode } = useCompanySchedulingMode(primaryCompanyId);
  const { canUseArenaManagement, loading: loadingArenaModule } = useCourtBookingModule(primaryCompanyId);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [courtId, setCourtId] = useState('');
  const [bands, setBands] = useState<BandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDay, setNewDay] = useState('1');
  const [newStart, setNewStart] = useState('08:00');
  const [newEnd, setNewEnd] = useState('18:00');
  const [newPrice, setNewPrice] = useState('0');
  const [newSort, setNewSort] = useState('0');

  const loadCourts = useCallback(async () => {
    if (!primaryCompanyId) return;
    const { data, error } = await supabase
      .from('courts')
      .select('id, name')
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
    setCourtId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ''));
  }, [primaryCompanyId]);

  const loadBands = useCallback(async () => {
    if (!courtId) {
      setBands([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('court_slot_price_bands')
      .select('id, court_id, day_of_week, start_time, end_time, slot_price, sort_order')
      .eq('court_id', courtId)
      .order('day_of_week', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) {
      showError('Erro ao carregar faixas: ' + error.message);
      setBands([]);
    } else {
      setBands((data as BandRow[]) || []);
    }
    setLoading(false);
  }, [courtId]);

  useEffect(() => {
    if (primaryCompanyId && isCourtMode && canUseArenaManagement) loadCourts();
  }, [primaryCompanyId, isCourtMode, canUseArenaManagement, loadCourts]);

  useEffect(() => {
    if (courtId) loadBands();
  }, [courtId, loadBands]);

  const handleAdd = async () => {
    if (!courtId || !primaryCompanyId) return;
    const price = parseFloat(newPrice.replace(',', '.'));
    if (Number.isNaN(price) || price < 0) {
      showError('Informe um preço válido.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('court_slot_price_bands').insert({
      court_id: courtId,
      day_of_week: parseInt(newDay, 10),
      start_time: toPgTime(newStart),
      end_time: toPgTime(newEnd),
      slot_price: price,
      sort_order: parseInt(newSort, 10) || 0,
    });
    setSaving(false);
    if (error) {
      showError('Erro ao salvar: ' + error.message);
      return;
    }
    showSuccess('Faixa adicionada.');
    await loadBands();
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error } = await supabase.from('court_slot_price_bands').delete().eq('id', id);
    setSaving(false);
    if (error) {
      showError('Erro ao excluir: ' + error.message);
      return;
    }
    showSuccess('Faixa removida.');
    await loadBands();
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
            Quadras
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preços por horário</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-gray-900 dark:text-white">Quadra</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={courtId} onValueChange={setCourtId}>
            <SelectTrigger className="max-w-md">
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
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Cada faixa vale para inícios de slot em <strong>[início, fim)</strong> (o horário de fim não entra).
            Sem faixa para aquele dia/horário usa o valor padrão da quadra (cadastro em Quadras).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-gray-900 dark:text-white">Nova faixa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 items-end">
          <div>
            <Label>Dia</Label>
            <Select value={newDay} onValueChange={setNewDay}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Início</Label>
            <Input type="time" className="mt-1" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
          </div>
          <div>
            <Label>Fim (exclusivo)</Label>
            <Input type="time" className="mt-1" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
          </div>
          <div>
            <Label>Preço / slot (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="mt-1"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input type="number" className="mt-1" value={newSort} onChange={(e) => setNewSort(e.target.value)} />
          </div>
          <Button
            className="bg-yellow-600 hover:bg-yellow-700 text-black"
            disabled={saving || !courtId}
            onClick={handleAdd}
          >
            Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-gray-900 dark:text-white">Faixas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : !courtId ? (
            <p className="text-gray-600">Selecione uma quadra.</p>
          ) : bands.length === 0 ? (
            <p className="text-gray-600">Nenhuma faixa; o preço padrão da quadra será usado em todo o dia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Ordem</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bands.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{WEEKDAY_LABELS[b.day_of_week] ?? b.day_of_week}</TableCell>
                    <TableCell>{formatTimeLabel(String(b.start_time))}</TableCell>
                    <TableCell>{formatTimeLabel(String(b.end_time))}</TableCell>
                    <TableCell>R$ {Number(b.slot_price).toFixed(2).replace('.', ',')}</TableCell>
                    <TableCell>{b.sort_order}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() => handleDelete(b.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CourtSlotPriceBandsPage;
