import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, Building, User, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PaymentAttempt {
  id: string;
  status: 'initiated' | 'approved' | 'rejected' | 'pending' | 'failed';
  payment_gateway_reference: string | null;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  companies: {
    name: string;
    cnpj: string;
  } | null;
  subscription_plans: {
    name: string;
  } | null;
  auth_users: {
    email: string;
  } | null;
}

const PaymentAttemptsPage: React.FC = () => {
  const navigate = useNavigate();
  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPaymentAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_attempts')
        .select(`
          id,
          status,
          payment_gateway_reference,
          amount,
          currency,
          created_at,
          updated_at,
          companies(name, cnpj),
          subscription_plans(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPaymentAttempts(data as PaymentAttempt[]);
    } catch (error: any) {
      console.error('Erro ao carregar tentativas de pagamento:', error);
      showError('Erro ao carregar tentativas de pagamento: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPaymentAttempts();
  }, [fetchPaymentAttempts]);

  const getStatusBadge = (status: PaymentAttempt['status']) => {
    switch (status) {
      case 'initiated': return <Badge className="bg-blue-500 text-white flex items-center gap-1"><Clock className="h-3 w-3" /> Iniciado</Badge>;
      case 'approved': return <Badge className="bg-green-500 text-white flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Aprovado</Badge>;
      case 'rejected': return <Badge className="bg-red-500 text-white flex items-center gap-1"><XCircle className="h-3 w-3" /> Rejeitado</Badge>;
      case 'pending': return <Badge className="bg-primary/100 text-black flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Pendente</Badge>;
      case 'failed': return <Badge className="bg-red-700 text-white flex items-center gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>;
      default: return <Badge variant="outline">Desconhecido</Badge>;
    }
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
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Relatório de Tentativas de Pagamento</h1>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Todas as Tentativas de Pagamento de Planos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-700">Carregando tentativas de pagamento...</p>
          ) : paymentAttempts.length === 0 ? (
            <p className="text-gray-600">Nenhuma tentativa de pagamento registrada ainda.</p>
          ) : (
            <ScrollArea className="h-[70vh]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plano</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref. Gateway</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paymentAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(parseISO(attempt.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                          <Building className="h-4 w-4 text-gray-500" />
                          {attempt.companies?.name || 'N/A'}
                          {attempt.companies?.cnpj && <span className="text-xs text-gray-500 ml-1">({attempt.companies.cnpj})</span>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                          {attempt.subscription_plans?.name || 'N/A'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          {attempt.auth_users?.email || 'N/A'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {attempt.currency} {attempt.amount.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {getStatusBadge(attempt.status)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {attempt.payment_gateway_reference || 'N/A'}
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

export default PaymentAttemptsPage;