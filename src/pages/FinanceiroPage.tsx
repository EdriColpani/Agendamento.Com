import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createButton, createCard } from '@/lib/dashboard-utils';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useMenuItems } from '@/hooks/useMenuItems';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { SellProductModal } from '@/components/SellProductModal';

interface Transaction {
  id: string;
  transaction_type: 'recebimento' | 'despesa' | 'abertura' | 'venda_avulsa_produto'; // Adicionado novo tipo
  total_amount: number;
  transaction_date: string;
  payment_method: string;
  observations: string | null;
  appointment_id: string | null;
  product_id?: string | null; // Novo: Link para o produto, se for venda de produto
  quantity_sold?: number | null; // Novo: Quantidade de produto vendida
  unit_price?: number | null; // Novo: Preço unitário no momento da venda
}

const FinanceiroPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { menuItems } = useMenuItems();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [isSellProductModalOpen, setIsSellProductModalOpen] = useState(false);
  const [entradas, setEntradas] = useState(0);
  const [saidas, setSaidas] = useState(0);

  // Verifica se o usuário/empresa tem acesso ao menu de produtos/estoque
  const hasProductMenuAccess = menuItems.some(
    (menu) => menu.menu_key === 'estoque' || menu.path === '/estoque'
  );

  const fetchTransactions = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany || !primaryCompanyId) {
      return;
    }

    setLoadingTransactions(true);
    try {
      // Fetch all transactions for the primary company from cash_movements
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('company_id', primaryCompanyId)
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      setTransactions(data as Transaction[]);

      // Calculate totals
      let totalEntradas = 0;
      let totalSaidas = 0;

      data.forEach(t => {
        if (t.transaction_type === 'recebimento' || t.transaction_type === 'abertura') {
          totalEntradas += t.total_amount;
        } else if (t.transaction_type === 'despesa') {
          totalSaidas += t.total_amount;
        }
      });

      setEntradas(totalEntradas);
      setSaidas(totalSaidas);

    } catch (error: any) {
      console.error('Erro ao carregar transações financeiras:', error);
      showError('Erro ao carregar dados financeiros: ' + error.message);
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  }, [sessionLoading, loadingPrimaryCompany, primaryCompanyId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleExportPdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const financeCards = [
    { title: 'Entradas', value: `R$ ${entradas.toFixed(2).replace('.', ',')}`, icon: 'fas fa-arrow-up', color: 'green' },
    { title: 'Saídas', value: `R$ ${saidas.toFixed(2).replace('.', ',')}`, icon: 'fas fa-arrow-down', color: 'red' },
    { title: 'Saldo', value: `R$ ${(entradas - saidas).toFixed(2).replace('.', ',')}`, icon: 'fas fa-wallet', color: 'primary' }
  ];

  if (sessionLoading || loadingPrimaryCompany || loadingTransactions) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando dados financeiros...</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa ter uma empresa primária cadastrada para acessar o financeiro.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Financeiro</h1>
        <div className="flex flex-wrap gap-3 md:justify-end">
          {createButton(handleExportPdf, 'fas fa-download', 'Exportar PDF', 'outline')}
          {hasProductMenuAccess && createButton(() => setIsSellProductModalOpen(true), 'fas fa-cash-register', 'Vender Produto Avulso')}
          {createButton(() => navigate('/nova-transacao'), 'fas fa-plus', 'Nova Transação')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {financeCards.map((card, idx) =>
          createCard(card.title, card.value, '', card.icon, card.color)
        )}
      </div>

      {/* Cards de Ações Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card de Pagamento de Comissões */}
        <Card 
          className="border-gray-200 cursor-pointer hover:border-primary hover:shadow-md transition-all"
          onClick={() => navigate('/financeiro/pagamento-comissoes')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-money-bill-wave text-blue-600 text-xl"></i>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Pagamento de Comissões</h3>
                  <p className="text-sm text-gray-600">Efetuar pagamentos de comissões aos colaboradores</p>
                </div>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-xl"></i>
            </div>
          </CardContent>
        </Card>

        {/* Card de Fechar Caixa */}
        <Card 
          className="border-gray-200 cursor-pointer hover:border-primary hover:shadow-md transition-all"
          onClick={() => navigate('/fechar-caixa')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <i className="fas fa-cash-register text-primary text-xl"></i>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Fechar Caixa</h3>
                  <p className="text-sm text-gray-600">Fechar caixa por período (dia, semana, quinzena ou mês)</p>
                </div>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-xl"></i>
            </div>
          </CardContent>
        </Card>

        {/* Card de Histórico de Fechamentos */}
        <Card 
          className="border-gray-200 cursor-pointer hover:border-primary hover:shadow-md transition-all"
          onClick={() => navigate('/financeiro/fechamentos')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-history text-green-600 text-xl"></i>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Histórico de Fechamentos</h3>
                  <p className="text-sm text-gray-600">Visualizar histórico de fechamentos realizados</p>
                </div>
              </div>
              <i className="fas fa-chevron-right text-gray-400 text-xl"></i>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200">
        <CardHeader><CardTitle className="text-gray-900">Transações Recentes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {transactions.length === 0 ? (
              <p className="text-gray-600">Nenhuma transação registrada ainda.</p>
            ) : (
              transactions.map((transacao, index) => {
                const isRecebimento = transacao.transaction_type === 'recebimento' || transacao.transaction_type === 'abertura';
                const iconClass = isRecebimento ? 'fa-arrow-up text-green-600' : 'fa-arrow-down text-red-600';
                const bgColor = isRecebimento ? 'bg-green-100' : 'bg-red-100';
                const sign = isRecebimento ? '+' : '-';
                const description = transacao.appointment_id ? 'Fechamento de Agendamento' : 
                                    transacao.transaction_type === 'abertura' ? 'Abertura de Caixa' : 
                                    transacao.observations || 'Transação Manual';
                const dateFormatted = format(parseISO(transacao.transaction_date), 'dd/MM/yyyy HH:mm', { locale: ptBR });

                return (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bgColor}`}>
                        <i className={`fas ${iconClass}`}></i>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{description}</p>
                        <p className="text-sm text-gray-600">{dateFormatted} ({transacao.payment_method})</p>
                      </div>
                    </div>
                    <p className={`font-semibold ${isRecebimento ? 'text-green-600' : 'text-red-600'}`}>
                      {sign} R$ {transacao.total_amount.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal de Venda Avulsa de Produto */}
      {primaryCompanyId && (
        <SellProductModal
          isOpen={isSellProductModalOpen}
          onClose={() => setIsSellProductModalOpen(false)}
          companyId={primaryCompanyId}
          onSaleSuccess={fetchTransactions}
        />
      )}
    </div>
  );
};

export default FinanceiroPage;