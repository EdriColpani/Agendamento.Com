import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ArenaPageHeader from '@/components/arena/ArenaPageHeader';
import { useTournamentAccess } from '@/hooks/useTournamentAccess';
import { createTournament, listTournaments } from '@/services/tournamentApi';
import { showError, showSuccess } from '@/utils/toast';
import { TOURNAMENT_STATUS_LABEL, type Tournament } from '@/types/tournament';
import { arenaTouchButtonClass } from '@/components/arena/arenaPageStyles';
import { PlusCircle } from 'lucide-react';

function knockoutPreview(groups: number, perGroup: number): string {
  const qualified = groups * perGroup;
  const firstRound =
    qualified >= 16 ? 'oitavas' : qualified >= 8 ? 'quartas' : qualified >= 4 ? 'semifinal' : 'final';
  return `${groups} grupos × ${perGroup} classificado${perGroup > 1 ? 's' : ''} = ${qualified} equipes no mata-mata (começa nas ${firstRound}).`;
}

const TournamentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { primaryCompanyId, canUseTournament, canCreateTournament, loading } = useTournamentAccess();
  const [rows, setRows] = useState<Tournament[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [groupCount, setGroupCount] = useState('4');
  const [qualify, setQualify] = useState('2');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!primaryCompanyId) return;
    setLoadingRows(true);
    try {
      setRows(await listTournaments(primaryCompanyId));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Erro ao carregar torneios.');
    } finally {
      setLoadingRows(false);
    }
  }, [primaryCompanyId]);

  useEffect(() => {
    if (canUseTournament) void load();
  }, [canUseTournament, load]);

  const handleCreate = async () => {
    if (!primaryCompanyId || !name.trim()) {
      showError('Informe o nome do torneio.');
      return;
    }
    setSaving(true);
    try {
      const id = await createTournament({
        companyId: primaryCompanyId,
        name: name.trim(),
        sportName: sport.trim() || undefined,
        groupCount: Number(groupCount),
        qualifyPerGroup: Number(qualify),
      });
      showSuccess('Torneio criado.');
      setOpen(false);
      navigate(`/quadras/torneios/${id}`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Não foi possível criar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-6 text-gray-600">Carregando torneios...</p>;
  }
  if (!canUseTournament) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold text-gray-900">Torneios</h1>
        <p className="text-sm text-gray-600">
          Este módulo não está liberado para a empresa atual. Para um novo evento, peça uma
          licença avulsa ao administrador ou ative o módulo no plano.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ArenaPageHeader
        title="Torneios"
        actions={
          <Button
            className={arenaTouchButtonClass}
            onClick={() => setOpen(true)}
            disabled={!canCreateTournament}
            title={
              canCreateTournament
                ? undefined
                : 'Licença do evento já usada. Peça uma nova licença avulsa para criar outro torneio.'
            }
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Novo torneio
          </Button>
        }
      />
      {!canCreateTournament ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Você pode consultar o histórico. Para criar outro torneio, peça uma nova licença avulsa
          ao administrador.
        </p>
      ) : null}

      {loadingRows ? (
        <p className="text-sm text-gray-600">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhum torneio ainda. Crie o primeiro para abrir a mesa.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer border-gray-200 hover:shadow-sm"
              onClick={() => navigate(`/quadras/torneios/${t.id}`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <p className="text-sm text-gray-600">
                    {t.group_count} grupos · {t.qualify_per_group} classificados
                    {t.sport_name ? ` · ${t.sport_name}` : ''}
                  </p>
                </div>
                <Badge>{TOURNAMENT_STATUS_LABEL[t.status]}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo torneio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input className="h-11 mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Esporte (opcional)</Label>
              <Input className="h-11 mt-1" value={sport} onChange={(e) => setSport(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Grupos</Label>
                <Select value={groupCount} onValueChange={setGroupCount}>
                  <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Classificados por grupo</Label>
                <Select value={qualify} onValueChange={setQualify}>
                  <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 (só o 1º)</SelectItem>
                    <SelectItem value="2">2 (1º e 2º)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              {knockoutPreview(Number(groupCount), Number(qualify))}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TournamentsPage;
