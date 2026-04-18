import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

type CommissionType = 'PERCENT' | 'FIXED';

interface ServiceRow {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface RowState {
  serviceId: string;
  allowed: boolean;
  commissionType: CommissionType;
  commissionValue: number;
}

interface CollaboratorServicesRecord {
  id: string;
  service_id: string;
  commission_type: CommissionType;
  commission_value: number;
  active: boolean;
}

const commissionTypeOptions: CommissionType[] = ['PERCENT', 'FIXED'];

const CollaboratorServicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { collaboratorId } = useParams<{ collaboratorId: string }>();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { session, loading: loadingSession } = useSession();

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [existingMap, setExistingMap] = useState<Record<string, CollaboratorServicesRecord>>({});
  const [collaboratorName, setCollaboratorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!collaboratorId || !primaryCompanyId) return;
    setLoading(true);
    try {
      const [{ data: servicesData, error: servicesError }, { data: linksData, error: linksError }, { data: collabData, error: collabError }] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, price, duration_minutes, status')
          .eq('company_id', primaryCompanyId)
          .eq('status', 'Ativo')
          .eq('is_arena_system_service_placeholder', false)
          .order('name', { ascending: true }),
        supabase
          .from('collaborator_services')
          .select('id, service_id, commission_type, commission_value, active')
          .eq('company_id', primaryCompanyId)
          .eq('collaborator_id', collaboratorId),
        supabase
          .from('collaborators')
          .select('first_name, last_name')
          .eq('id', collaboratorId)
          .single(),
      ]);

      if (servicesError) throw servicesError;
      if (linksError) throw linksError;
      if (collabError) throw collabError;

      setCollaboratorName(`${collabData?.first_name || ''} ${collabData?.last_name || ''}`.trim());

      const activeLinks = (linksData || []).reduce<Record<string, CollaboratorServicesRecord>>((acc, cur) => {
        acc[cur.service_id] = cur as CollaboratorServicesRecord;
        return acc;
      }, {});
      setExistingMap(activeLinks);

      setServices((servicesData || []) as ServiceRow[]);

      const initialRows: RowState[] = (servicesData || []).map((svc: any) => {
        const link = activeLinks[svc.id];
        return {
          serviceId: svc.id,
          allowed: !!link?.active,
          commissionType: (link?.commission_type as CommissionType) || 'PERCENT',
          commissionValue: link?.commission_value ?? 0,
        };
      });
      setRows(initialRows);
    } catch (error: any) {
      console.error('Erro ao carregar vínculos de serviços do colaborador:', error);
      showError('Erro ao carregar vínculos de serviços: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [collaboratorId, primaryCompanyId]);

  useEffect(() => {
    if (!loadingSession && !loadingPrimaryCompany) {
      loadData();
    }
  }, [loadData, loadingSession, loadingPrimaryCompany]);

  const handleAllowedChange = (serviceId: string, allowed: boolean) => {
    setRows(prev =>
      prev.map(row => (row.serviceId === serviceId ? { ...row, allowed } : row)),
    );
  };

  const handleCommissionTypeChange = (serviceId: string, commissionType: CommissionType) => {
    setRows(prev =>
      prev.map(row => (row.serviceId === serviceId ? { ...row, commissionType } : row)),
    );
  };

  const handleCommissionValueChange = (serviceId: string, value: number) => {
    setRows(prev =>
      prev.map(row => (row.serviceId === serviceId ? { ...row, commissionValue: value } : row)),
    );
  };

  const allowedCount = useMemo(() => rows.filter(r => r.allowed).length, [rows]);

  const handleSave = async () => {
    if (!collaboratorId || !primaryCompanyId) return;
    setSaving(true);
    try {
      const toUpsert = rows
        .filter(r => r.allowed)
        .map(r => ({
          company_id: primaryCompanyId,
          collaborator_id: collaboratorId,
          service_id: r.serviceId,
          commission_type: r.commissionType,
          commission_value: r.commissionValue ?? 0,
          active: true,
        }));

      const toDisableIds = rows
        .filter(r => !r.allowed && existingMap[r.serviceId]?.active)
        .map(r => existingMap[r.serviceId].id);

      if (toUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('collaborator_services')
          .upsert(toUpsert, { onConflict: 'collaborator_id,service_id' });
        if (upsertError) throw upsertError;
      }

      if (toDisableIds.length > 0) {
        const { error: disableError } = await supabase
          .from('collaborator_services')
          .update({ active: false })
          .in('id', toDisableIds);
        if (disableError) throw disableError;
      }

      showSuccess('Vínculos e comissões salvos com sucesso!');
      await loadData();
    } catch (error: any) {
      console.error('Erro ao salvar vínculos de serviços:', error);
      showError('Erro ao salvar vínculos: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingSession || loadingPrimaryCompany || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando vínculos de serviços...</p>
      </div>
    );
  }

  if (!session?.user || !primaryCompanyId || !collaboratorId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Sessão ou empresa não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Serviços do Colaborador</h1>
          {collaboratorName && (
            <p className="text-gray-600 text-sm mt-1">{collaboratorName}</p>
          )}
        </div>
        <Button
          variant="outline"
          className="!rounded-button whitespace-nowrap"
          onClick={() => navigate('/colaboradores')}
        >
          Voltar
        </Button>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Vincular serviços e comissão</span>
            <span className="text-sm text-gray-600">Serviços permitidos: {allowedCount}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <p className="text-gray-600">Nenhum serviço ativo para esta empresa.</p>
          ) : (
            <div className="space-y-4">
              {services.map(service => {
                const row = rows.find(r => r.serviceId === service.id);
                if (!row) return null;
                return (
                  <div
                    key={service.id}
                    className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">{service.name}</p>
                        <p className="text-sm text-gray-600">
                          R$ {service.price.toFixed(2).replace('.', ',')} • {service.duration_minutes} min
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-gray-700">Permitido</Label>
                        <Input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={row.allowed}
                          onChange={(e) => handleAllowedChange(service.id, e.target.checked)}
                        />
                      </div>
                    </div>

                    {row.allowed && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1">
                          <Label className="text-sm text-gray-700">Tipo de comissão</Label>
                          <Select
                            value={row.commissionType}
                            onValueChange={(value) => handleCommissionTypeChange(service.id, value as CommissionType)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {commissionTypeOptions.map(opt => (
                                <SelectItem key={opt} value={opt}>
                                  {opt === 'PERCENT' ? 'Percentual (%)' : 'Valor fixo'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-1">
                          <Label className="text-sm text-gray-700">
                            {row.commissionType === 'PERCENT' ? 'Percentual (%)' : 'Valor fixo (R$)'}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.commissionValue}
                            onChange={(e) => handleCommissionValueChange(service.id, Number(e.target.value))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              className="!rounded-button whitespace-nowrap"
              onClick={() => navigate('/colaboradores')}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving || services.length === 0}
            >
              {saving ? 'Salvando...' : 'Salvar vínculos'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CollaboratorServicesPage;

