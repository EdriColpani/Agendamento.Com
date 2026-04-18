import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building, Save, History, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatCnpjInput, formatZipCodeInput } from '@/utils/validation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from '@/components/ui/scroll-area';

// Zod schema for company details editing (subset of fields)
const companyDetailsSchema = z.object({
  name: z.string().min(1, "Nome fantasia é obrigatório."),
  razao_social: z.string().min(1, "Razão social é obrigatória."),
  cnpj: z.string().min(1, "CNPJ é obrigatório."), // Simplified validation here, assuming it was validated on creation
  company_email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  phone_number: z.string().min(1, "Telefone é obrigatório."),
  ativo: z.boolean(),
  segment_type: z.string().min(1, "Segmento é obrigatório."),
});

type CompanyDetailsFormValues = z.infer<typeof companyDetailsSchema>;

interface AuditLog {
  id: string;
  logged_at: string;
  operation: string;
  user_id: string;
  old_data: any;
  new_data: any;
}

interface SegmentType {
  id: string;
  name: string;
}

const CompanyDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [segments, setSegments] = useState<SegmentType[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CompanyDetailsFormValues>({
    resolver: zodResolver(companyDetailsSchema),
    defaultValues: {
      name: '',
      razao_social: '',
      cnpj: '',
      company_email: '',
      phone_number: '',
      ativo: false,
      segment_type: '',
    },
  });

  const ativoValue = watch('ativo');
  const segmentTypeValue = watch('segment_type');

  const formatPhoneNumberInput = (value: string) => {
    if (!value) return '';
    let cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 11) cleaned = cleaned.substring(0, 11);

    if (cleaned.length <= 2) {
      return `(${cleaned}`;
    } else if (cleaned.length <= 7) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
    } else if (cleaned.length <= 11) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
    }
    return cleaned;
  };

  const fetchCompanyData = useCallback(async () => {
    if (!companyId) return;

    setLoading(true);
    try {
      // Fetch Company Details
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;

      // Fetch Segments (Global access)
      const { data: segmentsData, error: segmentsError } = await supabase
        .from('segment_types')
        .select('id, name')
        .order('name', { ascending: true });

      if (segmentsError) throw segmentsError;
      setSegments(segmentsData);

      // Fetch Audit Logs
      const { data: logsData, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', 'companies')
        .eq('record_id', companyId)
        .order('logged_at', { ascending: false });

      if (logsError) throw logsError;
      setLogs(logsData as AuditLog[]);

      // Format data for form
      reset({
        name: companyData.name,
        razao_social: companyData.razao_social,
        cnpj: formatCnpjInput(companyData.cnpj || ''),
        company_email: companyData.company_email,
        phone_number: formatPhoneNumberInput(companyData.phone_number || ''),
        ativo: companyData.ativo,
        segment_type: companyData.segment_type,
      });

    } catch (error: any) {
      console.error('Erro ao carregar detalhes da empresa:', error);
      showError('Erro ao carregar detalhes da empresa: ' + error.message);
      navigate('/admin-dashboard/companies');
    } finally {
      setLoading(false);
    }
  }, [companyId, navigate, reset]);

  useEffect(() => {
    fetchCompanyData();
  }, [fetchCompanyData]);

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatPhoneNumberInput(e.target.value);
    setValue('phone_number', formattedValue, { shouldValidate: true });
  };

  const onSubmit = async (data: CompanyDetailsFormValues) => {
    if (!companyId) return;
    setIsSaving(true);

    try {
      const cleanedPhoneNumber = data.phone_number.replace(/\D/g, '');
      const cleanedCnpj = data.cnpj.replace(/\D/g, '');

      const { error } = await supabase
        .from('companies')
        .update({
          name: data.name,
          razao_social: data.razao_social,
          cnpj: cleanedCnpj,
          company_email: data.company_email,
          phone_number: cleanedPhoneNumber,
          ativo: data.ativo,
          segment_type: data.segment_type,
        })
        .eq('id', companyId);

      if (error) throw error;

      showSuccess('Detalhes da empresa atualizados com sucesso!');
      fetchCompanyData(); // Re-fetch data and logs
    } catch (error: any) {
      console.error('Erro ao salvar detalhes da empresa:', error);
      showError('Erro ao salvar detalhes da empresa: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderLogDetails = (log: AuditLog) => {
    const changes: { field: string, old: any, new: any }[] = [];
    
    if (log.operation === 'UPDATE' && log.old_data && log.new_data) {
      for (const key in log.new_data) {
        if (log.old_data[key] !== log.new_data[key]) {
          changes.push({
            field: key,
            old: log.old_data[key],
            new: log.new_data[key],
          });
        }
      }
    } else if (log.operation === 'INSERT' && log.new_data) {
      changes.push({ field: 'Registro', old: 'N/A', new: 'Criado' });
    } else if (log.operation === 'DELETE' && log.old_data) {
      changes.push({ field: 'Registro', old: 'Deletado', new: 'N/A' });
    }

    return (
      <div className="text-xs space-y-1 mt-2 p-2 bg-gray-100 rounded dark:bg-gray-700">
        {changes.map((change, index) => (
          <div key={index} className="flex justify-between">
            <span className="font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[40%]">{change.field}:</span>
            <span className="text-gray-600 dark:text-gray-400 truncate max-w-[40%]">{change.old !== undefined ? String(change.old) : 'N/A'}</span>
            <ArrowLeft className="h-3 w-3 text-gray-400 rotate-180" />
            <span className="text-gray-900 dark:text-white font-medium truncate max-w-[40%]">{change.new !== undefined ? String(change.new) : 'N/A'}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando detalhes da empresa...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard/companies')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Empresas
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Detalhes da Empresa: {watch('name')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal: Edição de Dados */}
        <Card className="lg:col-span-2 border-gray-200">
          <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><Building className="h-5 w-5" /> Dados Cadastrais</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="razao_social">Razão Social *</Label>
                  <Input id="razao_social" {...register('razao_social')} className="mt-1" />
                  {errors.razao_social && <p className="text-red-500 text-xs mt-1">{errors.razao_social.message}</p>}
                </div>
                <div>
                  <Label htmlFor="name">Nome Fantasia *</Label>
                  <Input id="name" {...register('name')} className="mt-1" />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cnpj">CNPJ *</Label>
                  <Input id="cnpj" {...register('cnpj')} disabled className="mt-1 bg-gray-100" />
                  {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj.message}</p>}
                </div>
                <div>
                  <Label htmlFor="company_email">E-mail da Empresa *</Label>
                  <Input id="company_email" type="email" {...register('company_email')} className="mt-1" />
                  {errors.company_email && <p className="text-red-500 text-xs mt-1">{errors.company_email.message}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="phone_number">Telefone *</Label>
                <Input 
                  id="phone_number" 
                  type="tel" 
                  value={watch('phone_number')}
                  onChange={handlePhoneNumberChange}
                  maxLength={15}
                  className="mt-1" 
                />
                {errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number.message}</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="segment_type">Segmento *</Label>
                  <Select onValueChange={(value) => setValue('segment_type', value, { shouldValidate: true })} value={segmentTypeValue}>
                    <SelectTrigger id="segment_type" className="mt-1">
                      <SelectValue placeholder="Selecione o segmento" />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((segment) => (
                        <SelectItem key={segment.id} value={segment.id}>
                          {segment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.segment_type && <p className="text-red-500 text-xs mt-1">{errors.segment_type.message}</p>}
                </div>
                <div className="flex items-center pt-6">
                  <input
                    id="ativo"
                    type="checkbox"
                    checked={ativoValue}
                    {...register('ativo')}
                    className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <Label htmlFor="ativo" className="ml-2 text-sm font-medium text-gray-700">
                    Empresa Ativa
                  </Label>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base"
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Coluna Lateral: Logs e Assinatura */}
        <div className="lg:col-span-1 space-y-6">
          {/* Gerenciamento de Assinatura (Placeholder) */}
          <Card className="border-gray-200">
            <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><DollarSign className="h-5 w-5" /> Assinatura</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Funcionalidade de edição de plano e status de pagamento em desenvolvimento.
              </p>
              <Button 
                variant="outline" 
                className="w-full !rounded-button"
                onClick={() => showError('Gerenciamento de assinatura em desenvolvimento.')}
              >
                Gerenciar Plano
              </Button>
            </CardContent>
          </Card>

          {/* Logs de Auditoria */}
          <Card className="border-gray-200">
            <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><History className="h-5 w-5" /> Logs de Auditoria</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-4">
                  {logs.length === 0 ? (
                    <p className="text-gray-600 text-sm">Nenhum log de alteração encontrado.</p>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="border-b pb-3">
                        <div className="flex justify-between items-start">
                          <span className={`font-bold text-sm ${log.operation === 'UPDATE' ? 'text-blue-600' : log.operation === 'INSERT' ? 'text-green-600' : 'text-red-600'}`}>
                            {log.operation}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(parseISO(log.logged_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">
                          Usuário: {log.user_id ? `${log.user_id.substring(0, 8)}...` : 'Sistema'}
                        </p>
                        {renderLogDetails(log)}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CompanyDetailsPage;