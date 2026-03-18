import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from '@/integrations/supabase/client';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { showError, showSuccess } from '@/utils/toast';
import { Loader2, MessageCircle, XCircle, ListChecks } from 'lucide-react';

type MessageStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

interface MessageKind {
  id: string;
  code: string;
  description: string;
}

interface ClientInfo {
  id: string;
  name: string | null;
  phone: string | null;
}

interface MessageLog {
  id: string;
  company_id: string;
  client_id: string | null;
  appointment_id: string | null;
  message_kind_id: string;
  channel: string;
  scheduled_for: string;
  sent_at: string | null;
  status: MessageStatus;
  clients?: ClientInfo | null;
  message_kinds?: MessageKind | null;
}

type StatusFilter = 'ALL' | MessageStatus;

const formatDateTimeBR = (iso: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getMessageTypeLabel = (kind?: MessageKind | null): string => {
  if (!kind?.code) return 'Agradecimento';
  if (kind.code === 'APPOINTMENT_REMINDER') return 'Lembrete';
  // Demais tipos (confirmação, cancelamento, pós-atendimento) serão tratados como "Agradecimento"
  return 'Agradecimento';
};

const getStatusLabel = (status: MessageStatus): string => {
  switch (status) {
    case 'PENDING':
      return 'Pendente';
    case 'SENT':
      return 'Enviado';
    case 'FAILED':
      return 'Falhou';
    case 'CANCELLED':
      return 'Cancelado';
    default:
      return status;
  }
};

const getStatusBadgeVariant = (status: MessageStatus): string => {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-500 text-black';
    case 'SENT':
      return 'bg-green-500 text-white';
    case 'FAILED':
      return 'bg-red-500 text-white';
    case 'CANCELLED':
      return 'bg-gray-400 text-white';
    default:
      return 'bg-gray-300 text-black';
  }
};

const WhatsAppMessageQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchMessages = useCallback(async () => {
    if (!primaryCompanyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_send_log')
        .select(`
          id,
          company_id,
          client_id,
          appointment_id,
          message_kind_id,
          channel,
          scheduled_for,
          sent_at,
          status,
          clients ( id, name, phone ),
          message_kinds ( id, code, description )
        `)
        .eq('company_id', primaryCompanyId)
        .eq('channel', 'WHATSAPP')
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as MessageLog[]);
    } catch (error: any) {
      console.error('Erro ao carregar fila de mensagens:', error);
      showError('Erro ao carregar fila de mensagens: ' + (error.message || 'Erro desconhecido.'));
      setMessages([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [primaryCompanyId]);

  useEffect(() => {
    if (!loadingPrimaryCompany && primaryCompanyId) {
      fetchMessages();
    }
  }, [loadingPrimaryCompany, primaryCompanyId, fetchMessages]);

  const todayYmdBR = useMemo(() => {
    const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const year = nowBR.getFullYear();
    const month = String(nowBR.getMonth() + 1).padStart(2, '0');
    const day = String(nowBR.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const filteredMessages = useMemo(() => {
    // 1) Aplica filtros atuais
    const visible = messages.filter((msg) => {
      if (statusFilter !== 'ALL' && msg.status !== statusFilter) {
        return false;
      }

      if (selectedDate) {
        if (!msg.scheduled_for) return false;
        const scheduledBR = new Date(msg.scheduled_for).toLocaleDateString('en-CA', {
          timeZone: 'America/Sao_Paulo',
        }); // yyyy-MM-dd
        if (scheduledBR !== selectedDate) return false;
      }

      return true;
    });

    // 2) Ordena por prioridade de status e horário
    const statusPriority: Record<MessageStatus, number> = {
      PENDING: 1,    // primeiro: o que ainda vai ser enviado
      SENT: 2,       // depois: o que já foi enviado
      FAILED: 3,     // por último: falhas
      CANCELLED: 4,  // e canceladas
    };

    return [...visible].sort((a, b) => {
      const pa = statusPriority[a.status];
      const pb = statusPriority[b.status];

      if (pa !== pb) {
        return pa - pb;
      }

      // Dentro do mesmo status, ordenar por data/hora de envio (mais antigo primeiro)
      const da = a.scheduled_for || '';
      const db = b.scheduled_for || '';
      return da.localeCompare(db);
    });
  }, [messages, statusFilter, selectedDate]);

  const metrics = useMemo(() => {
    const forToday = messages.filter((m) => {
      if (m.status !== 'PENDING' || !m.scheduled_for) return false;
      const dateBR = new Date(m.scheduled_for).toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
      }); // yyyy-MM-dd
      return dateBR === todayYmdBR;
    }).length;

    const cancelled = messages.filter((m) => m.status === 'CANCELLED').length;
    const sent = messages.filter((m) => m.status === 'SENT').length;

    return { forToday, cancelled, sent };
  }, [messages, todayYmdBR]);

  const toggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    const ids = new Set(filteredMessages.map((m) => m.id));
    setSelectedIds(ids);
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (!primaryCompanyId) return;
    if (selectedIds.size === 0) {
      showError('Nenhuma mensagem selecionada para excluir.');
      return;
    }

    const confirm = window.confirm(
      `Tem certeza que deseja excluir ${selectedIds.size} mensagem(ns) da fila? Essa ação não pode ser desfeita.`
    );
    if (!confirm) return;

    try {
      const ids = Array.from(selectedIds);
      const { data, error } = await supabase.rpc('delete_whatsapp_messages_for_company', {
        p_company_id: primaryCompanyId,
        p_ids: ids,
      });

      if (error || data?.success === false) {
        throw error || new Error(data?.error || 'Falha ao excluir mensagens.');
      }

      setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      showSuccess('Mensagens selecionadas excluídas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao excluir mensagens selecionadas:', error);
      showError('Erro ao excluir mensagens selecionadas: ' + (error.message || 'Erro desconhecido.'));
    }
  };

  const handleDeleteAllFiltered = async () => {
    if (!primaryCompanyId) return;
    if (filteredMessages.length === 0) {
      showError('Não há mensagens na lista atual para excluir.');
      return;
    }

    const confirm = window.prompt(
      `Você está prestes a excluir ${filteredMessages.length} mensagem(ns) da lista atual.\n` +
      'Digite EXCLUIR para confirmar.'
    );
    if (confirm !== 'EXCLUIR') {
      showError('Exclusão cancelada.');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('delete_whatsapp_messages_for_company', {
        p_company_id: primaryCompanyId,
        p_ids: null,
        p_status: statusFilter === 'ALL' ? null : statusFilter,
        p_date: selectedDate || null,
      });

      if (error || data?.success === false) {
        throw error || new Error(data?.error || 'Falha ao excluir mensagens.');
      }

      // Atualiza estado local removendo todas as que batem com o filtro atual
      const filteredIds = new Set(filteredMessages.map((m) => m.id));
      setMessages((prev) => prev.filter((m) => !filteredIds.has(m.id)));
      setSelectedIds(new Set());
      showSuccess('Mensagens da lista atual excluídas com sucesso.');
    } catch (error: any) {
      console.error('Erro ao excluir mensagens filtradas:', error);
      showError('Erro ao excluir mensagens filtradas: ' + (error.message || 'Erro desconhecido.'));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
  };

  const handleCancelMessage = async (id: string) => {
    if (!primaryCompanyId) return;

    setCancellingId(id);
    try {
      const { data, error } = await supabase.rpc('cancel_whatsapp_message', {
        p_log_id: id,
      });

      if (error) {
        console.error('Erro ao cancelar envio de mensagem:', error);
        showError('Erro ao cancelar envio da mensagem: ' + (error.message || 'Erro desconhecido.'));
        return;
      }

      // Atualiza estado localmente para evitar reload completo
      if (data && Array.isArray(messages)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: 'CANCELLED' } : m))
        );
      } else {
        // fallback: recarregar lista
        await fetchMessages();
      }

      showSuccess('Envio da mensagem cancelado com sucesso.');
    } catch (error: any) {
      console.error('Erro inesperado ao cancelar mensagem:', error);
      showError('Erro inesperado ao cancelar mensagem: ' + (error.message || 'Erro desconhecido.'));
    } finally {
      setCancellingId(null);
    }
  };

  if (loadingPrimaryCompany || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-600" />
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para gerenciar a fila de mensagens WhatsApp.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-yellow-600 hover:bg-yellow-700 text-black"
          onClick={() => navigate('/register-company')}
        >
          <i className="fas fa-building mr-2"></i>
          Cadastrar Empresa
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Gerenciar Mensagens WhatsApp
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Visualize e gerencie a fila de mensagens automáticas enviadas aos clientes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="!rounded-button"
            onClick={() => navigate('/mensagens-whatsapp')}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Configurar Mensagens
          </Button>
          <Button
            variant="outline"
            className="!rounded-button"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ListChecks className="h-4 w-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gray-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Mensagens para hoje</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.forToday}</p>
              <p className="text-xs text-gray-500 mt-1">Status: Pendente</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Canceladas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.cancelled}</p>
              <p className="text-xs text-gray-500 mt-1">Total de mensagens canceladas</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total enviadas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.sent}</p>
              <p className="text-xs text-gray-500 mt-1">Mensagens enviadas com sucesso</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
          <CardDescription>Refine a visualização da fila de mensagens.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(value: StatusFilter) => setStatusFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="SENT">Enviado</SelectItem>
                <SelectItem value="FAILED">Falhou</SelectItem>
                <SelectItem value="CANCELLED">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de envio
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Deixe em branco para ver todas as datas ou escolha uma data específica.
            </p>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full !rounded-button"
              onClick={() => {
                setStatusFilter('ALL');
                setSelectedDate('');
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de mensagens */}
      <Card className="border-gray-200">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Mensagens Agendadas</CardTitle>
            <CardDescription>
              Visualize as mensagens pendentes, enviadas, falhas ou canceladas.
              {filteredMessages.length > 0 && (
                <span className="ml-2 text-gray-600">
                  ({filteredMessages.length} {filteredMessages.length === 1 ? 'mensagem' : 'mensagens'})
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="!rounded-button"
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
            >
              Excluir selecionadas
            </Button>
            <Button
              type="button"
              variant="outline"
              className="!rounded-button border-red-500 text-red-600 hover:bg-red-50"
              onClick={handleDeleteAllFiltered}
              disabled={filteredMessages.length === 0}
            >
              Excluir tudo da lista
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredMessages.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              Nenhuma mensagem encontrada com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Container com altura máxima e scroll vertical */}
              <div className="max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        <Checkbox
                          checked={
                            filteredMessages.length > 0 &&
                            filteredMessages.every((m) => selectedIds.has(m.id))
                          }
                          onCheckedChange={(checked) => toggleSelectAllVisible(!!checked)}
                          aria-label="Selecionar todas"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Cliente
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Telefone
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Tipo de Mensagem
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Data/Hora do Envio
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Status
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMessages.map((msg) => {
                      const clientName = msg.clients?.name || 'Cliente não identificado';
                      const phone = msg.clients?.phone || '-';
                      const typeLabel = getMessageTypeLabel(msg.message_kinds);
                      const statusLabel = getStatusLabel(msg.status);

                      const canCancel = msg.status === 'PENDING';

                      return (
                        <tr key={msg.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <Checkbox
                              checked={selectedIds.has(msg.id)}
                              onCheckedChange={(checked) => toggleSelectOne(msg.id, !!checked)}
                              aria-label="Selecionar mensagem"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {clientName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {phone}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {typeLabel}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                            {formatDateTimeBR(msg.scheduled_for)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Badge className={getStatusBadgeVariant(msg.status)}>
                              {statusLabel}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {canCancel ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="!rounded-button border-red-500 text-red-600 hover:bg-red-50"
                                onClick={() => handleCancelMessage(msg.id)}
                                disabled={cancellingId === msg.id}
                              >
                                {cancellingId === msg.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <XCircle className="h-4 w-4 mr-2" />
                                )}
                                Cancelar Envio
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppMessageQueuePage;


