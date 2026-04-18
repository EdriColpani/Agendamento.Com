import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from '@/integrations/supabase/client';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { showError, showSuccess } from '@/utils/toast';
import { Loader2, Plus, Edit, Trash2, MessageSquare, Settings, Clock, CheckCircle2, XCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MessageKind {
  id: string;
  code: string;
  description: string;
}

interface MessageTemplate {
  id: string;
  company_id: string;
  message_kind_id: string;
  channel: string;
  name: string;
  body_template: string;
  is_active: boolean;
  message_kinds?: MessageKind;
}

type MessageReference = 'APPOINTMENT_START' | 'APPOINTMENT_CREATION' | 'APPOINTMENT_COMPLETION';

interface MessageSchedule {
  id: string;
  company_id: string;
  message_kind_id: string;
  channel: string;
  offset_value: number;
  offset_unit: 'MINUTES' | 'HOURS' | 'DAYS';
  reference: MessageReference;
  is_active: boolean;
  message_kinds?: MessageKind;
}

interface MessagingProvider {
  id: string;
  name: string;
  channel: string;
  base_url: string;
  http_method: 'GET' | 'POST' | 'PUT';
  is_active: boolean;
}

const WhatsAppMessagingPage: React.FC = () => {
  const navigate = useNavigate();
  const { primaryCompanyId } = usePrimaryCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  
  // Estados para Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [messageKinds, setMessageKinds] = useState<MessageKind[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    message_kind_id: '',
    body_template: '',
    is_active: true,
  });

  // Estados para Regras de Envio
  const [schedules, setSchedules] = useState<MessageSchedule[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MessageSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{
    message_kind_id: string;
    offset_value: number;
    offset_unit: 'MINUTES' | 'HOURS' | 'DAYS';
    reference: MessageReference;
    is_active: boolean;
  }>({
    message_kind_id: '',
    offset_value: 1,
    offset_unit: 'DAYS',
    reference: 'APPOINTMENT_START',
    is_active: true,
  });

  // Estados para Provedor
  const [providers, setProviders] = useState<MessagingProvider[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'template' | 'schedule'; id: string } | null>(null);

  // Carregar dados iniciais
  useEffect(() => {
    if (primaryCompanyId) {
      fetchAllData();
    }
  }, [primaryCompanyId]);

  const fetchAllData = useCallback(async () => {
    if (!primaryCompanyId) return;

    setLoading(true);
    try {
      // 1. Verificar se WhatsApp está habilitado
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('whatsapp_messaging_enabled')
        .eq('id', primaryCompanyId)
        .single();

      if (companyError) throw companyError;
      setWhatsappEnabled(company?.whatsapp_messaging_enabled || false);

      // 2. Carregar tipos de mensagem
      const { data: kinds, error: kindsError } = await supabase
        .from('message_kinds')
        .select('*')
        .order('code');

      if (kindsError) throw kindsError;
      setMessageKinds(kinds || []);

      // 3. Carregar templates da empresa
      const { data: templatesData, error: templatesError } = await supabase
        .from('company_message_templates')
        .select(`
          *,
          message_kinds (*)
        `)
        .eq('company_id', primaryCompanyId)
        .order('created_at', { ascending: false });

      if (templatesError) throw templatesError;
      setTemplates(templatesData || []);

      // 4. Carregar regras de envio da empresa
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('company_message_schedules')
        .select(`
          *,
          message_kinds (*)
        `)
        .eq('company_id', primaryCompanyId)
        .order('created_at', { ascending: false });

      if (schedulesError) throw schedulesError;
      setSchedules(schedulesData || []);

      // 5. Carregar provedor ativo da empresa (apenas leitura)
      // Primeiro tenta buscar provedor específico da empresa
      let { data: providersData, error: providersError } = await supabase
        .from('messaging_providers')
        .select('id, name, channel, base_url, http_method, is_active')
        .eq('channel', 'WHATSAPP')
        .eq('is_active', true)
        .eq('company_id', primaryCompanyId)
        .limit(1);

      // Se não encontrou provedor específico, busca provedor global (legado)
      if (!providersData || providersData.length === 0) {
        const { data: globalProviders, error: globalError } = await supabase
          .from('messaging_providers')
          .select('id, name, channel, base_url, http_method, is_active')
          .eq('channel', 'WHATSAPP')
          .eq('is_active', true)
          .is('company_id', null)
          .limit(1);

        if (globalError) {
          providersError = globalError;
        } else {
          providersData = globalProviders;
        }
      }

      if (providersError) throw providersError;
      setProviders(providersData || []);

    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId]);

  // Toggle WhatsApp habilitado
  const handleToggleWhatsApp = async () => {
    if (!primaryCompanyId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({ whatsapp_messaging_enabled: !whatsappEnabled })
        .eq('id', primaryCompanyId);

      if (error) throw error;
      setWhatsappEnabled(!whatsappEnabled);
      showSuccess(`Módulo de mensagens WhatsApp ${!whatsappEnabled ? 'habilitado' : 'desabilitado'} com sucesso!`);
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      showError('Erro ao atualizar status: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // CRUD Templates
  const handleSaveTemplate = async () => {
    if (!primaryCompanyId || !templateForm.message_kind_id || !templateForm.body_template.trim()) {
      showError('Preencha todos os campos obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      // Buscar descrição do tipo de mensagem para usar como nome
      const selectedKind = messageKinds.find(k => k.id === templateForm.message_kind_id);
      const templateName = selectedKind?.description || `Template ${templateForm.message_kind_id}`;

      const data = {
        company_id: primaryCompanyId,
        message_kind_id: templateForm.message_kind_id,
        channel: 'WHATSAPP',
        name: templateName,
        body_template: templateForm.body_template.trim(),
        is_active: templateForm.is_active,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('company_message_templates')
          .update(data)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        showSuccess('Template atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('company_message_templates')
          .insert(data);

        if (error) throw error;
        showSuccess('Template criado com sucesso!');
      }

      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      setTemplateForm({ message_kind_id: '', body_template: '', is_active: true });
      fetchAllData();
    } catch (error: any) {
      console.error('Erro ao salvar template:', error);
      showError('Erro ao salvar template: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      message_kind_id: template.message_kind_id,
      body_template: template.body_template,
      is_active: template.is_active,
    });
    setIsTemplateModalOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!itemToDelete || itemToDelete.type !== 'template') return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_message_templates')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;
      showSuccess('Template excluído com sucesso!');
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchAllData();
    } catch (error: any) {
      console.error('Erro ao excluir template:', error);
      showError('Erro ao excluir template: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // CRUD Regras de Envio
  const handleSaveSchedule = async () => {
    if (!primaryCompanyId || !scheduleForm.message_kind_id || scheduleForm.offset_value <= 0) {
      showError('Preencha todos os campos obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      // Buscar o tipo de mensagem selecionado para determinar se o offset deve ser negativo
      const selectedKind = messageKinds.find(k => k.id === scheduleForm.message_kind_id);
      const isReminder = selectedKind?.code === 'APPOINTMENT_REMINDER';
      
      // Se for lembrete, o offset deve ser negativo (antes do agendamento)
      // Se for outro tipo, o offset deve ser positivo (depois do agendamento)
      const finalOffsetValue = isReminder 
        ? -Math.abs(scheduleForm.offset_value) 
        : Math.abs(scheduleForm.offset_value);

      const data = {
        company_id: primaryCompanyId,
        message_kind_id: scheduleForm.message_kind_id,
        channel: 'WHATSAPP',
        offset_value: finalOffsetValue,
        offset_unit: scheduleForm.offset_unit,
        reference: scheduleForm.reference,
        is_active: scheduleForm.is_active,
      };

      if (editingSchedule) {
        const { error } = await supabase
          .from('company_message_schedules')
          .update(data)
          .eq('id', editingSchedule.id);

        if (error) throw error;
        showSuccess('Regra de envio atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('company_message_schedules')
          .insert(data);

        if (error) throw error;
        showSuccess('Regra de envio criada com sucesso!');
      }

      setIsScheduleModalOpen(false);
      setEditingSchedule(null);
      setScheduleForm({ message_kind_id: '', offset_value: 1, offset_unit: 'DAYS', reference: 'APPOINTMENT_START' as const, is_active: true });
      fetchAllData();
    } catch (error: any) {
      console.error('Erro ao salvar regra de envio:', error);
      showError('Erro ao salvar regra de envio: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSchedule = (schedule: MessageSchedule) => {
    setEditingSchedule(schedule);
    // Ao editar, exibir o valor absoluto do offset (o usuário sempre digita positivo)
    setScheduleForm({
      message_kind_id: schedule.message_kind_id,
      offset_value: Math.abs(schedule.offset_value),
      offset_unit: schedule.offset_unit,
      reference: schedule.reference,
      is_active: schedule.is_active,
    });
    setIsScheduleModalOpen(true);
  };

  const handleDeleteSchedule = async () => {
    if (!itemToDelete || itemToDelete.type !== 'schedule') return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_message_schedules')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;
      showSuccess('Regra de envio excluída com sucesso!');
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchAllData();
    } catch (error: any) {
      console.error('Erro ao excluir regra de envio:', error);
      showError('Erro ao excluir regra de envio: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const formatOffsetUnit = (unit: string) => {
    const map: { [key: string]: string } = {
      MINUTES: 'minutos',
      HOURS: 'horas',
      DAYS: 'dias',
    };
    return map[unit] || unit;
  };

  const formatReference = (ref: string) => {
    const map: { [key: string]: string } = {
      APPOINTMENT_START: 'Início do agendamento',
      APPOINTMENT_CREATION: 'Criação do agendamento',
      APPOINTMENT_COMPLETION: 'Finalização do atendimento',
    };
    return map[ref] || ref;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Mensagens WhatsApp</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configure templates, regras de envio e gerencie mensagens automáticas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="whatsapp-enabled" className="cursor-pointer">
              Habilitar Mensagens WhatsApp
            </Label>
            <Checkbox
              id="whatsapp-enabled"
              checked={whatsappEnabled}
              onCheckedChange={handleToggleWhatsApp}
              disabled={saving}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="!rounded-button whitespace-nowrap"
            onClick={() => navigate('/mensagens-whatsapp/gerenciar-mensagens')}
            disabled={!whatsappEnabled}
          >
            Gerenciar Fila de Mensagens
          </Button>
        </div>
      </div>

      {!whatsappEnabled && (
        <Card className="border-primary/20 bg-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-amber-900">
              <MessageSquare className="h-5 w-5" />
              <p className="font-medium">
                O módulo de mensagens WhatsApp está desabilitado. Habilite acima para começar a configurar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="templates">
            <MessageSquare className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="schedules">
            <Clock className="h-4 w-4 mr-2" />
            Regras de Envio
          </TabsTrigger>
          <TabsTrigger value="provider">
            <Settings className="h-4 w-4 mr-2" />
            Provedor
          </TabsTrigger>
        </TabsList>

        {/* Aba Templates */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <CardDescription>
              Crie e gerencie templates de mensagens que serão enviadas aos clientes
            </CardDescription>
            <Button
              onClick={() => {
                setEditingTemplate(null);
                setTemplateForm({ message_kind_id: '', body_template: '', is_active: true });
                setIsTemplateModalOpen(true);
              }}
              disabled={!whatsappEnabled}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
          </div>

          <div className="grid gap-4">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  Nenhum template cadastrado. Clique em "Novo Template" para criar.
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">
                            {template.message_kinds?.description || 'Tipo não encontrado'}
                          </h3>
                          {template.is_active ? (
                            <Badge className="bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativo
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                          {template.body_template}
                        </p>
                        <div className="mt-2 text-xs text-gray-500">
                          Placeholders disponíveis: [CLIENTE], [EMPRESA], [DATA_HORA]
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                          disabled={!whatsappEnabled}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setItemToDelete({ type: 'template', id: template.id });
                            setDeleteDialogOpen(true);
                          }}
                          disabled={!whatsappEnabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Aba Regras de Envio */}
        <TabsContent value="schedules" className="space-y-4">
          <div className="flex justify-between items-center">
            <CardDescription>
              Defina quando as mensagens devem ser enviadas em relação aos agendamentos
            </CardDescription>
            <Button
              onClick={() => {
                setEditingSchedule(null);
                setScheduleForm({ message_kind_id: '', offset_value: 1, offset_unit: 'DAYS', reference: 'APPOINTMENT_START' as const, is_active: true });
                setIsScheduleModalOpen(true);
              }}
              disabled={!whatsappEnabled}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Regra
            </Button>
          </div>

          <div className="grid gap-4">
            {schedules.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  Nenhuma regra de envio cadastrada. Clique em "Nova Regra" para criar.
                </CardContent>
              </Card>
            ) : (
              schedules.map((schedule) => (
                <Card key={schedule.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">
                            {schedule.message_kinds?.description || 'Tipo não encontrado'}
                          </h3>
                          {schedule.is_active ? (
                            <Badge className="bg-green-500">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativo
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Enviar <strong>{Math.abs(schedule.offset_value)}</strong> {formatOffsetUnit(schedule.offset_unit)}{' '}
                          {schedule.offset_value < 0 ? 'antes' : 'depois'} do{' '}
                          <strong>{formatReference(schedule.reference).toLowerCase()}</strong>
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditSchedule(schedule)}
                          disabled={!whatsappEnabled}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setItemToDelete({ type: 'schedule', id: schedule.id });
                            setDeleteDialogOpen(true);
                          }}
                          disabled={!whatsappEnabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Aba Provedor */}
        <TabsContent value="provider" className="space-y-4">
          <CardDescription>
            Informações sobre o provedor de WhatsApp configurado para sua empresa (somente leitura)
          </CardDescription>
          {providers.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                <p className="mb-2">Nenhum provedor de WhatsApp ativo configurado para sua empresa.</p>
                <p className="text-sm">Entre em contato com o suporte para configurar o provedor.</p>
              </CardContent>
            </Card>
          ) : (
            providers.map((provider) => (
              <Card key={provider.id}>
                <CardHeader>
                  <CardTitle>{provider.name}</CardTitle>
                  <CardDescription>Canal: {provider.channel}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <Label>URL Base</Label>
                    <Input value={provider.base_url} disabled />
                  </div>
                  <div>
                    <Label>Método HTTP</Label>
                    <Input value={provider.http_method} disabled />
                  </div>
                  <Badge className={provider.is_active ? 'bg-green-500' : 'bg-gray-500'}>
                    {provider.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <p className="text-xs text-gray-500 mt-2">
                    ℹ️ As configurações do provedor são gerenciadas pelo suporte técnico.
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Modal Template */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl m-4">
            <CardHeader>
              <CardTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tipo de Mensagem *</Label>
                <Select
                  value={templateForm.message_kind_id}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, message_kind_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de mensagem" />
                  </SelectTrigger>
                  <SelectContent>
                    {messageKinds.map((kind) => (
                      <SelectItem key={kind.id} value={kind.id}>
                        {kind.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Template da Mensagem *</Label>
                <Textarea
                  value={templateForm.body_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, body_template: e.target.value })}
                  placeholder="Ex: Olá [CLIENTE], seu agendamento na [EMPRESA] está confirmado para [DATA_HORA]."
                  rows={6}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use [CLIENTE], [EMPRESA] e [DATA_HORA] como placeholders
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="template-active"
                  checked={templateForm.is_active}
                  onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_active: checked as boolean })}
                />
                <Label htmlFor="template-active" className="cursor-pointer">
                  Template ativo
                </Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setIsTemplateModalOpen(false);
                  setEditingTemplate(null);
                  setTemplateForm({ message_kind_id: '', body_template: '', is_active: true });
                }}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveTemplate} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingTemplate ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal Regra de Envio */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl m-4">
            <CardHeader>
              <CardTitle>{editingSchedule ? 'Editar Regra de Envio' : 'Nova Regra de Envio'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tipo de Mensagem *</Label>
                <Select
                  value={scheduleForm.message_kind_id}
                  onValueChange={(value) => setScheduleForm({ ...scheduleForm, message_kind_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de mensagem" />
                  </SelectTrigger>
                  <SelectContent>
                    {messageKinds.map((kind) => (
                      <SelectItem key={kind.id} value={kind.id}>
                        {kind.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor do Offset *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={scheduleForm.offset_value}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, offset_value: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>Unidade *</Label>
                  <Select
                    value={scheduleForm.offset_unit}
                    onValueChange={(value: 'MINUTES' | 'HOURS' | 'DAYS') => setScheduleForm({ ...scheduleForm, offset_unit: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MINUTES">Minutos</SelectItem>
                      <SelectItem value="HOURS">Horas</SelectItem>
                      <SelectItem value="DAYS">Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Referência *</Label>
                <Select
                  value={scheduleForm.reference}
                  onValueChange={(value: MessageReference) => setScheduleForm({ ...scheduleForm, reference: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPOINTMENT_START">Início do agendamento</SelectItem>
                    <SelectItem value="APPOINTMENT_CREATION">Criação do agendamento</SelectItem>
                    <SelectItem value="APPOINTMENT_COMPLETION">Finalização do atendimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="schedule-active"
                  checked={scheduleForm.is_active}
                  onCheckedChange={(checked) => setScheduleForm({ ...scheduleForm, is_active: checked as boolean })}
                />
                <Label htmlFor="schedule-active" className="cursor-pointer">
                  Regra ativa
                </Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setIsScheduleModalOpen(false);
                  setEditingSchedule(null);
                  setScheduleForm({ message_kind_id: '', offset_value: 1, offset_unit: 'DAYS', reference: 'APPOINTMENT_START' as const, is_active: true });
                }}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveSchedule} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingSchedule ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este {itemToDelete?.type === 'template' ? 'template' : 'regra de envio'}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (itemToDelete?.type === 'template') {
                  handleDeleteTemplate();
                } else if (itemToDelete?.type === 'schedule') {
                  handleDeleteSchedule();
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WhatsAppMessagingPage;

