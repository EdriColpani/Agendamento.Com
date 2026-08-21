import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { grantTournamentLicense } from '@/services/tournamentApi';
import { useIsGlobalAdmin } from '@/hooks/useIsGlobalAdmin';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface ArenaCompany {
  id: string;
  name: string;
}

interface LicenseRow {
  id: string;
  company_id: string;
  status: string;
  valid_until: string;
  duration_days: number;
  companies?: { name: string } | { name: string }[] | null;
}

const AdminTournamentLicensesPage: React.FC = () => {
  const navigate = useNavigate();
  const { isGlobalAdmin, loadingGlobalAdminCheck } = useIsGlobalAdmin();
  const [arenas, setArenas] = useState<ArenaCompany[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [days, setDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadArenas = useCallback(async () => {
    const { data: segments, error: segmentsError } = await supabase
      .from('segment_types')
      .select('id')
      .eq('scheduling_mode', 'court');
    if (segmentsError) {
      showError('Não foi possível carregar os segmentos de arena.');
      return;
    }
    const segmentIds = (segments || []).map((s) => s.id);
    if (segmentIds.length === 0) {
      setArenas([]);
      return;
    }
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .in('segment_type', segmentIds)
      .order('name', { ascending: true });
    if (error) {
      showError('Não foi possível carregar as empresas arena.');
      return;
    }
    setArenas((data || []) as ArenaCompany[]);
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('tournament_event_licenses')
      .select('id, company_id, status, valid_until, duration_days, companies(name)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      showError('Não foi possível carregar as licenças.');
      return;
    }
    setRows((data || []) as LicenseRow[]);
  }, []);

  useEffect(() => {
    if (isGlobalAdmin) {
      void loadArenas();
      void load();
    }
  }, [isGlobalAdmin, load, loadArenas]);

  const handleGrant = async () => {
    if (!companyId.trim()) {
      showError('Selecione a empresa arena.');
      return;
    }
    setSaving(true);
    try {
      await grantTournamentLicense(companyId.trim(), Number(days) || 7, notes.trim() || undefined);
      showSuccess('Licença concedida.');
      setNotes('');
      await load();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Falha ao conceder.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingGlobalAdminCheck) return <p className="p-6">Carregando...</p>;
  if (!isGlobalAdmin) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">Licenças avulsas de torneio</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Conceder SKU B</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Empresa arena</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="mt-1 h-11">
                <SelectValue placeholder={arenas.length ? 'Selecione a arena' : 'Nenhuma arena cadastrada'} />
              </SelectTrigger>
              <SelectContent>
                {arenas.map((arena) => (
                  <SelectItem key={arena.id} value={arena.id}>
                    {arena.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Validade (dias)</Label>
            <Input className="mt-1" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div>
            <Label>Observação</Label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={() => void handleGrant()} disabled={saving || !companyId}>
            Conceder
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {rows.map((row) => {
          const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
          return (
            <div key={row.id} className="rounded border p-3 text-sm">
              <p className="font-medium">{company?.name || row.company_id}</p>
              <p className="text-gray-600">{row.status} · {row.duration_days} dias · até {new Date(row.valid_until).toLocaleDateString('pt-BR')}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminTournamentLicensesPage;
