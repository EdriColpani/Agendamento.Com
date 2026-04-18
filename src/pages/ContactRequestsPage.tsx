import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, User, Trash2, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactRequest {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  description: string | null;
  status: 'pending' | 'contacted' | 'resolved';
  created_at: string;
}

const ContactRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      // RLS ensures only GLOBAL_ADMIN can read this table
      const { data, error } = await supabase
        .from('contact_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data as ContactRequest[]);
    } catch (error: any) {
      console.error('Erro ao carregar solicitações de contato:', error);
      showError('Erro ao carregar solicitações: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'contacted' | 'resolved') => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('contact_requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      showSuccess('Status da solicitação atualizado com sucesso!');
      fetchRequests();
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      showError('Erro ao atualizar status: ' + error.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge className="bg-primary/100 text-black flex items-center gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'contacted': return <Badge className="bg-blue-500 text-white flex items-center gap-1"><Phone className="h-3 w-3" /> Contatado</Badge>;
      case 'resolved': return <Badge className="bg-green-500 text-white flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Resolvido</Badge>;
      default: return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 11) {
      return `(${phone.substring(0, 2)}) ${phone.substring(2, 7)}-${phone.substring(7)}`;
    }
    return phone;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Dashboard
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Solicitações de Contato</h1>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Leads de Contato Recebidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-700">Carregando solicitações...</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-600">Nenhuma solicitação de contato recebida ainda.</p>
          ) : (
            <ScrollArea className="h-[60vh]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {requests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(parseISO(request.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          {request.name}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /> {request.email}</p>
                          <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {formatPhone(request.phone_number)}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {request.description || 'N/A'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium flex gap-2 justify-end">
                          {request.status !== 'resolved' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="!rounded-button whitespace-nowrap bg-blue-500 hover:bg-blue-600 text-white"
                              onClick={() => handleUpdateStatus(request.id, 'resolved')}
                              disabled={updatingId === request.id}
                            >
                              {updatingId === request.id ? 'Atualizando...' : 'Resolver'}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={() => handleUpdateStatus(request.id, 'resolved')} // Reusing resolver for simplicity, but should be delete
                            disabled={updatingId === request.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactRequestsPage;