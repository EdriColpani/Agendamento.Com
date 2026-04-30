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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UsersRound, Trash2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

export interface AttributionRepOption {
  id: string;
  display_name: string;
  referral_code: string;
}

interface AttributionRow {
  id: string;
  attributed_at: string;
  referral_code_used: string;
  companies: { id: string; name: string; razao_social: string | null } | null;
  external_sales_representatives: { id: string; display_name: string; referral_code: string } | null;
}

interface CompanyHit {
  id: string;
  name: string;
  razao_social: string | null;
}

interface ExternalSalesAttributionPanelProps {
  representatives: AttributionRepOption[];
  sessionReady: boolean;
  onAttributionChanged?: () => void;
}

export const ExternalSalesAttributionPanel: React.FC<ExternalSalesAttributionPanelProps> = ({
  representatives,
  sessionReady,
  onAttributionChanged,
}) => {
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [companyHits, setCompanyHits] = useState<CompanyHit[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyHit | null>(null);
  const [repId, setRepId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!sessionReady) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('company_external_sales_attributions')
      .select(
        'id, attributed_at, referral_code_used, companies(id, name, razao_social), external_sales_representatives(id, display_name, referral_code)',
      )
      .order('attributed_at', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      showError('Erro ao carregar atribuições: ' + error.message);
      return;
    }
    setRows((data as AttributionRow[]) || []);
  }, [sessionReady]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const runCompanySearch = async () => {
    const q = search.trim();
    if (q.length < 2) {
      showError('Digite pelo menos 2 caracteres para buscar a empresa.');
      return;
    }
    const esc = q.replace(/%/g, '\\%').replace(/,/g, '');
    setSearching(true);
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, razao_social')
      .or(`name.ilike.%${esc}%,razao_social.ilike.%${esc}%`)
      .limit(25);
    setSearching(false);
    if (error) {
      showError(error.message);
      setCompanyHits([]);
      return;
    }
    setCompanyHits((data as CompanyHit[]) || []);
    if (!data?.length) {
      showError('Nenhuma empresa encontrada.');
    }
  };

  const resetDialog = () => {
    setSearch('');
    setCompanyHits([]);
    setSelectedCompany(null);
    setRepId('');
    setDialogOpen(false);
  };

  const saveAttribution = async () => {
    if (!selectedCompany || !repId) {
      showError('Selecione empresa e vendedor.');
      return;
    }
    const rep = representatives.find((r) => r.id === repId);
    if (!rep) {
      showError('Vendedor inválido.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('company_external_sales_attributions').upsert(
        {
          company_id: selectedCompany.id,
          representative_id: rep.id,
          referral_code_used: rep.referral_code,
        },
        { onConflict: 'company_id' },
      );
      if (error) throw error;
      showSuccess('Atribuição salva. Próximos pagamentos de plano usarão este vínculo.');
      resetDialog();
      await fetchRows();
      onAttributionChanged?.();
    } catch (e: unknown) {
      const err = e as { message?: string };
      showError(err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('company_external_sales_attributions').delete().eq('id', deleteId);
    setDeleteId(null);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess('Atribuição removida.');
    await fetchRows();
    onAttributionChanged?.();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            Empresas ↔ vendedor (indicação)
          </CardTitle>
          <Button
            type="button"
            className="!rounded-button"
            disabled={representatives.length === 0}
            onClick={() => {
              setSearch('');
              setCompanyHits([]);
              setSelectedCompany(null);
              setRepId('');
              setDialogOpen(true);
            }}
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Nova / corrigir atribuição
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Quando o cadastro não usou <code className="text-xs bg-muted px-1 rounded">?ref=</code>, defina aqui qual
            vendedor recebe comissão dessa empresa. Uma empresa só pode ter um vendedor por vez; alterar substitui o
            vínculo (histórico de comissão no ledger permanece).
          </p>
          {loading ? (
            <p className="text-sm">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma atribuição cadastrada.</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Empresa</th>
                    <th className="p-2">Vendedor</th>
                    <th className="p-2">Código na época</th>
                    <th className="p-2">Atribuído em</th>
                    <th className="p-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="p-2 max-w-[200px]" title={row.companies?.razao_social ?? ''}>
                        <span className="font-medium">{row.companies?.name ?? '—'}</span>
                        {row.companies?.razao_social ? (
                          <span className="block text-muted-foreground truncate text-[11px]">
                            {row.companies.razao_social}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">{row.external_sales_representatives?.display_name ?? '—'}</td>
                      <td className="p-2 font-mono text-[11px]">{row.referral_code_used}</td>
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.attributed_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(row.id)}
                          title="Remover atribuição"
                        >
                          <Trash2 className="h-4 w-4" />
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

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && resetDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Atribuir empresa a vendedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Buscar empresa (nome ou razão social)</Label>
              <div className="flex gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mín. 2 caracteres" />
                <Button type="button" variant="secondary" disabled={searching} onClick={() => void runCompanySearch()}>
                  Buscar
                </Button>
              </div>
            </div>
            {companyHits.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                {companyHits.map((c) => (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-start gap-2 rounded p-2 text-sm hover:bg-muted ${
                      selectedCompany?.id === c.id ? 'bg-muted' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="pickCo"
                      checked={selectedCompany?.id === c.id}
                      onChange={() => setSelectedCompany(c)}
                    />
                    <span>
                      <span className="font-medium">{c.name}</span>
                      {c.razao_social ? (
                        <span className="block text-xs text-muted-foreground">{c.razao_social}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label>Vendedor externo</Label>
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetDialog}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveAttribution()}>
              {saving ? 'Salvando...' : 'Salvar atribuição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover atribuição?</AlertDialogTitle>
            <AlertDialogDescription>
              A empresa deixa de estar vinculada a este vendedor. Novos pagamentos de plano não gerarão comissão para
              vendedor até nova atribuição ou cadastro com link de indicação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
