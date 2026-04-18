import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Textarea } from "@/components/ui/textarea";
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { usePeriodTransactions } from '@/hooks/usePeriodTransactions';
import { useCheckPeriodClosed, calculatePeriod, ClosureType } from '@/hooks/useCashClosure';
import { format as dateFnsFormat, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';

// Zod schema for cash register form
const cashRegisterSchema = z.object({
  closure_type: z.enum(['dia', 'semana', 'quinzena', 'mes']),
  reference_date: z.string().min(1, "Data de referência é obrigatória"),
  notas_100: z.preprocess((val) => Number(val) || 0, z.number().int().min(0)),
  notas_50: z.preprocess((val) => Number(val) || 0, z.number().int().min(0)),
  notas_20: z.preprocess((val) => Number(val) || 0, z.number().int().min(0)),
  outras_moedas: z.preprocess((val) => Number(String(val).replace(',', '.')) || 0, z.number().min(0)),
  despesa_produtos: z.preprocess((val) => Number(String(val).replace(',', '.')) || 0, z.number().min(0)),
  outras_despesas: z.preprocess((val) => Number(String(val).replace(',', '.')) || 0, z.number().min(0)),
  descricao_despesas: z.string().max(500).optional(),
  observacoes_fechamento: z.string().max(500).optional(),
});

type CashRegisterFormValues = z.infer<typeof cashRegisterSchema>;

const FecharCaixaPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [closureType, setClosureType] = useState<ClosureType>('dia');
  const [referenceDate, setReferenceDate] = useState<string>(dateFnsFormat(new Date(), 'yyyy-MM-dd'));

  // Memorizar o período para evitar recriação a cada render
  const period = useMemo(() => {
    try {
      const refDate = new Date(referenceDate);
      if (isNaN(refDate.getTime())) {
        return null;
      }
      return calculatePeriod(closureType, refDate);
    } catch (error) {
      console.error('[FecharCaixaPage] Erro ao calcular período:', error);
      return null;
    }
  }, [closureType, referenceDate]);

  const { summary, loading: loadingTransactions } = usePeriodTransactions(
    period?.startDate || new Date(), 
    period?.endDate || new Date()
  );
  const { isClosed, loading: loadingClosureCheck, refetch: refetchPeriodCheck } = useCheckPeriodClosed(
    primaryCompanyId && period ? period : null
  );

  // Atualizar verificação quando a página recebe foco (útil quando o caixa é reaberto em outra aba)
  React.useEffect(() => {
    const handleFocus = () => {
      if (primaryCompanyId && period) {
        // Forçar uma nova verificação quando a página recebe foco
        setTimeout(() => {
          refetchPeriodCheck?.();
        }, 100);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [primaryCompanyId, period, refetchPeriodCheck]);

  // Atualizar verificação quando o período muda
  React.useEffect(() => {
    if (primaryCompanyId && period) {
      // Forçar verificação quando o período muda
      setTimeout(() => {
        refetchPeriodCheck?.();
      }, 100);
    }
  }, [primaryCompanyId, period?.startDateDb, period?.endDateDb, refetchPeriodCheck]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CashRegisterFormValues>({
    resolver: zodResolver(cashRegisterSchema),
    defaultValues: {
      closure_type: 'dia',
      reference_date: dateFnsFormat(new Date(), 'yyyy-MM-dd'),
      notas_100: 0,
      notas_50: 0,
      notas_20: 0,
      outras_moedas: 0,
      despesa_produtos: 0,
      outras_despesas: 0,
      descricao_despesas: '',
      observacoes_fechamento: '',
    },
  });

  const formValues = watch();

  // Calculations for cash count
  const totalNotas100 = (Number(formValues.notas_100) || 0) * 100;
  const totalNotas50 = (Number(formValues.notas_50) || 0) * 50;
  const totalNotas20 = (Number(formValues.notas_20) || 0) * 20;
  const outrasMoedas = Number(formValues.outras_moedas) || 0;
  const totalContado = totalNotas100 + totalNotas50 + totalNotas20 + outrasMoedas;

  // Calculations for expenses
  const despesaProdutos = Number(formValues.despesa_produtos) || 0;
  const outrasDespesas = Number(formValues.outras_despesas) || 0;
  const totalDespesas = despesaProdutos + outrasDespesas;

  // Calculations for final profit
  const lucroLiquido = (Number(summary.totalBalance) || 0) - totalDespesas;

  const handleClosureTypeChange = (value: string) => {
    setClosureType(value as ClosureType);
    setValue('closure_type', value as ClosureType);
  };

  const handleReferenceDateChange = (value: string) => {
    setReferenceDate(value);
    setValue('reference_date', value);
  };

  const onSubmit = async (formData: CashRegisterFormValues) => {
    if (!primaryCompanyId || !session?.user) {
      showError('Erro de autenticação ou empresa primária não encontrada.');
      return;
    }

    if (isClosed) {
      showError(`O caixa já foi fechado para este período (${period.startDateDb} a ${period.endDateDb}).`);
      return;
    }

    // Validar se há transações no período
    if (summary.transactions.length === 0) {
      showError('Não há transações no período selecionado para fechar.');
      return;
    }

    // Basic validation check: Does the counted cash match the expected cash receipts?
    const expectedCash = Number(summary.totalCash) || 0;
    const diff = Math.abs(totalContado - expectedCash);
    
    // Só mostrar mensagem se houver diferença significativa (maior que R$ 0,01)
    if (diff > 0.01) {
      const message = totalContado > expectedCash 
        ? `O dinheiro contado (R$ ${Number(totalContado).toFixed(2).replace('.', ',')}) está R$ ${diff.toFixed(2).replace('.', ',')} ACIMA do esperado (R$ ${expectedCash.toFixed(2).replace('.', ',')}).`
        : `O dinheiro contado (R$ ${Number(totalContado).toFixed(2).replace('.', ',')}) está R$ ${diff.toFixed(2).replace('.', ',')} ABAIXO do esperado (R$ ${expectedCash.toFixed(2).replace('.', ',')}).`;
      
      const confirmProceed = window.confirm(`${message} Deseja prosseguir com o fechamento de caixa, registrando a diferença?`);
      
      if (!confirmProceed) {
        return;
      }
    }

    // Confirmar fechamento
    if (!period) {
      showError('Erro ao calcular período. Verifique a data de referência.');
      return;
    }
    
    const confirmMessage = `Deseja fechar o caixa para o período de ${dateFnsFormat(period.startDate, 'dd/MM/yyyy', { locale: ptBR })} a ${dateFnsFormat(period.endDate, 'dd/MM/yyyy', { locale: ptBR })}?\n\nEsta ação não pode ser desfeita.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Inserir fechamento na tabela cash_register_closures
      const { error: closureError } = await supabase
        .from('cash_register_closures')
        .insert({
          company_id: primaryCompanyId,
          closure_type: formData.closure_type,
          start_date: period.startDateDb,
          end_date: period.endDateDb,
          total_receipts: summary.totalReceipts,
          total_expenses: (Number(summary.totalExpenses) || 0) + totalDespesas,
          total_balance: lucroLiquido,
          cash_counted: totalContado,
          card_pix_total: summary.totalCardPix,
          observations: formData.observacoes_fechamento || null,
          user_id: session.user.id,
        });

      if (closureError) {
        if (closureError.code === '23505') { // Unique constraint violation
          showError('Este período já foi fechado anteriormente.');
        } else {
          throw closureError;
        }
        return;
      }

      // Registrar despesas adicionais (se houver)
      if (totalDespesas > 0) {
        const despesasToInsert = [];
        
        if (formData.despesa_produtos > 0) {
          despesasToInsert.push({
            company_id: primaryCompanyId,
            user_id: session.user.id,
            total_amount: formData.despesa_produtos,
            payment_method: 'dinheiro',
            transaction_type: 'despesa',
            transaction_date: period.endDate.toISOString(),
            observations: 'Compra de produtos (Despesa de Fechamento)',
          });
        }

        if (formData.outras_despesas > 0) {
          despesasToInsert.push({
            company_id: primaryCompanyId,
            user_id: session.user.id,
            total_amount: formData.outras_despesas,
            payment_method: 'dinheiro',
            transaction_type: 'despesa',
            transaction_date: period.endDate.toISOString(),
            observations: `Outras despesas: ${formData.descricao_despesas || 'Sem descrição'}`,
          });
        }

        if (despesasToInsert.length > 0) {
          const { error: despesaError } = await supabase
            .from('cash_movements')
            .insert(despesasToInsert);
          
          if (despesaError) {
            console.error('[FecharCaixaPage] Erro ao registrar despesas:', despesaError);
            // Não falhar o fechamento por causa das despesas
          }
        }
      }

      showSuccess(`Caixa fechado com sucesso para o período de ${dateFnsFormat(period.startDate, 'dd/MM/yyyy', { locale: ptBR })} a ${dateFnsFormat(period.endDate, 'dd/MM/yyyy', { locale: ptBR })}!`);
      navigate('/financeiro');
    } catch (error: any) {
      console.error('[FecharCaixaPage] Erro ao fechar caixa:', error);
      showError('Erro ao fechar caixa: ' + error.message);
    }
  };

  const loading = loadingPrimaryCompany || loadingTransactions || loadingClosureCheck;

  if (loadingPrimaryCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando informações da empresa...</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Você precisa ter uma empresa primária cadastrada para acessar o fechamento de caixa.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando dados do caixa...</p>
      </div>
    );
  }

  const periodLabel = {
    dia: 'Dia',
    semana: 'Semana',
    quinzena: 'Quinzena',
    mes: 'Mês',
  }[closureType];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Fechamento de Caixa</h1>
      </div>
      
      {isClosed && !loadingClosureCheck && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <div className="flex items-center justify-between">
            <div>
              <strong className="font-bold">Caixa Já Fechado!</strong>
              <span className="block sm:inline ml-2">
                O caixa já foi fechado para o período de {dateFnsFormat(period.startDate, 'dd/MM/yyyy', { locale: ptBR })} a {dateFnsFormat(period.endDate, 'dd/MM/yyyy', { locale: ptBR })}.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!primaryCompanyId || !period) return;
                
                // Fazer uma verificação direta no banco para garantir
                try {
                  const { data, error } = await supabase
                    .from('cash_register_closures')
                    .select('id, start_date, end_date')
                    .eq('company_id', primaryCompanyId)
                    .eq('start_date', period.startDateDb)
                    .eq('end_date', period.endDateDb)
                    .limit(1)
                    .maybeSingle();

                  console.log('[FecharCaixaPage] Verificação manual:', {
                    found: !!data,
                    closureId: data?.id || null,
                    startDate: period.startDateDb,
                    endDate: period.endDateDb
                  });

                  // Sempre atualizar o hook após a verificação manual
                  await refetchPeriodCheck?.();
                } catch (err) {
                  console.error('[FecharCaixaPage] Erro na verificação manual:', err);
                  await refetchPeriodCheck?.();
                }
              }}
              disabled={loadingClosureCheck}
              className="ml-4"
              title="Atualizar verificação de período"
            >
              <i className={`fas fa-sync-alt ${loadingClosureCheck ? 'fa-spin' : ''}`}></i>
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-4xl space-y-6">
        {/* Seleção de Período */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Selecionar Período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="closure_type">Tipo de Fechamento</Label>
                <Select value={closureType} onValueChange={handleClosureTypeChange}>
                  <SelectTrigger id="closure_type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Dia</SelectItem>
                    <SelectItem value="semana">Semana</SelectItem>
                    <SelectItem value="quinzena">Quinzena</SelectItem>
                    <SelectItem value="mes">Mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="reference_date">Data de Referência</Label>
                <Input
                  id="reference_date"
                  type="date"
                  value={referenceDate}
                  onChange={(e) => handleReferenceDateChange(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Período selecionado:</strong> {dateFnsFormat(period.startDate, 'dd/MM/yyyy', { locale: ptBR })} a {dateFnsFormat(period.endDate, 'dd/MM/yyyy', { locale: ptBR })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Resumo do Período */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Recebimentos</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">R$ {summary.totalReceipts.toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-arrow-up text-green-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Despesas</p>
                  <p className="text-2xl font-bold text-red-600 mt-2">R$ {(Number(summary.totalExpenses) || 0).toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-arrow-down text-red-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Saldo do Período</p>
                  <p className="text-2xl font-bold text-primary mt-2">R$ {(Number(summary.totalBalance) || 0).toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <i className="fas fa-wallet text-primary text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Dinheiro (Esperado)</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">R$ {summary.totalCash.toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-money-bill text-green-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Cartão/PIX</p>
                  <p className="text-2xl font-bold text-blue-600 mt-2">R$ {summary.totalCardPix.toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-credit-card text-blue-600 text-xl"></i>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Transações do Período */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Transações do Período</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTransactions ? (
              <p className="text-gray-600 text-center py-4">Carregando transações...</p>
            ) : summary.transactions.length === 0 ? (
              <p className="text-gray-600 text-center py-4">Nenhuma transação encontrada no período selecionado.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {summary.transactions.map((transaction) => {
                  const isRecebimento = transaction.transaction_type === 'recebimento' || 
                                       transaction.transaction_type === 'abertura' || 
                                       transaction.transaction_type === 'venda_avulsa_produto';
                  const iconClass = isRecebimento ? 'fa-arrow-up text-green-600' : 'fa-arrow-down text-red-600';
                  const bgColor = isRecebimento ? 'bg-green-100' : 'bg-red-100';
                  const sign = isRecebimento ? '+' : '-';
                  
                  let description = '';
                  if (transaction.appointment_id) {
                    description = 'Fechamento de Agendamento';
                  } else if (transaction.transaction_type === 'abertura') {
                    description = 'Abertura de Caixa';
                  } else if (transaction.transaction_type === 'venda_avulsa_produto') {
                    description = transaction.observations || 'Venda Avulsa de Produto';
                  } else {
                    description = transaction.observations || 'Transação Manual';
                  }

                  const dateFormatted = format(parseISO(transaction.transaction_date), 'dd/MM/yyyy HH:mm', { locale: ptBR });
                  const amount = parseFloat(transaction.total_amount as any) || 0;

                  return (
                    <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bgColor}`}>
                          <i className={`fas ${iconClass}`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{description}</p>
                          <p className="text-sm text-gray-600">
                            {dateFormatted} • {transaction.payment_method}
                          </p>
                        </div>
                      </div>
                      <p className={`font-semibold whitespace-nowrap ml-4 ${isRecebimento ? 'text-green-600' : 'text-red-600'}`}>
                        {sign} R$ {amount.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Formulário de Fechamento */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Conferência de Caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <input type="hidden" {...register('closure_type')} />
              <input type="hidden" {...register('reference_date')} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Dinheiro Físico Contado</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <label className="text-sm font-medium text-gray-700">Notas de R$ 100,00:</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          {...register('notas_100')}
                          className="w-20 text-sm border-gray-300 text-center"
                          min="0"
                        />
                        <span className="text-sm text-gray-600 w-24 text-right">= R$ {totalNotas100.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <label className="text-sm font-medium text-gray-700">Notas de R$ 50,00:</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          {...register('notas_50')}
                          className="w-20 text-sm border-gray-300 text-center"
                          min="0"
                        />
                        <span className="text-sm text-gray-600 w-24 text-right">= R$ {totalNotas50.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <label className="text-sm font-medium text-gray-700">Notas de R$ 20,00:</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          {...register('notas_20')}
                          className="w-20 text-sm border-gray-300 text-center"
                          min="0"
                        />
                        <span className="text-sm text-gray-600 w-24 text-right">= R$ {totalNotas20.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <label className="text-sm font-medium text-gray-700">Moedas e outras:</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          step="0.01"
                          {...register('outras_moedas')}
                          className="w-20 text-sm border-gray-300 text-center"
                          min="0"
                          placeholder="0,00"
                        />
                        <span className="text-sm text-gray-400 w-24 text-right"></span>
                      </div>
                    </div>
                    <div className="border-t pt-4 mt-4">
                      <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                        <span className="text-base font-semibold text-gray-900">Total Contado:</span>
                        <span className={`text-lg font-bold w-24 text-right ${totalContado === summary.totalCash ? 'text-green-600' : 'text-red-600'}`}>
                          R$ {totalContado.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      {totalContado !== summary.totalCash && (
                        <div className="grid grid-cols-[140px_1fr] items-center gap-4 mt-2">
                          <span className="text-xs text-red-500">Diferença:</span>
                          <span className="text-xs font-medium text-red-500 w-24 text-right">
                            R$ {Math.abs(totalContado - summary.totalCash).toFixed(2).replace('.', ',')} em relação ao esperado
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Despesas do Período</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Compra de produtos
                      </label>
                      <Input
                        type="number"
                        {...register('despesa_produtos')}
                        step="0.01"
                        className="border-gray-300 text-sm"
                        min="0"
                      />
                      {errors.despesa_produtos && <p className="text-red-500 text-xs mt-1">{errors.despesa_produtos.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Outras despesas
                      </label>
                      <Input
                        type="number"
                        {...register('outras_despesas')}
                        step="0.01"
                        className="border-gray-300 text-sm"
                        min="0"
                      />
                      {errors.outras_despesas && <p className="text-red-500 text-xs mt-1">{errors.outras_despesas.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descrição das despesas
                      </label>
                      <Textarea
                        {...register('descricao_despesas')}
                        maxLength={500}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20 resize-none"
                        placeholder="Descreva as despesas do período..."
                      ></Textarea>
                      {errors.descricao_despesas && <p className="text-red-500 text-xs mt-1">{errors.descricao_despesas.message}</p>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-t pt-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-gray-600">Saldo do Período</p>
                      <p className="text-lg font-bold text-gray-900">R$ {(Number(summary.totalBalance) || 0).toFixed(2).replace('.', ',')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Despesas Adicionais</p>
                      <p className="text-lg font-bold text-red-600">R$ {Number(totalDespesas).toFixed(2).replace('.', ',')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Lucro Líquido</p>
                      <p className="text-xl font-bold text-green-600">R$ {Number(lucroLiquido).toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Observações do Fechamento
                </label>
                <Textarea
                  {...register('observacoes_fechamento')}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-24 resize-none"
                  placeholder="Observações gerais sobre o fechamento..."
                ></Textarea>
                <p className="text-xs text-gray-500 mt-1">Máximo 500 caracteres</p>
                {errors.observacoes_fechamento && <p className="text-red-500 text-xs mt-1">{errors.observacoes_fechamento.message}</p>}
              </div>
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="!rounded-button whitespace-nowrap cursor-pointer flex-1"
                  onClick={() => navigate(-1)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
                  disabled={isClosed || summary.transactions.length === 0}
                >
                  <i className="fas fa-lock mr-2"></i>
                  {isClosed ? 'Período Já Fechado' : `Fechar Caixa (${periodLabel})`}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FecharCaixaPage;
