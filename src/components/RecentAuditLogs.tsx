import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { History, User, Building, FileText, DollarSign, Package, ArrowRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AuditLog {
  id: string;
  logged_at: string;
  table_name: string;
  operation: string;
  user_id: string;
  old_data: any; // Incluído old_data
  new_data: any;
}

const getIconForTable = (tableName: string) => {
  switch (tableName) {
    case 'companies':
      return <Building className="h-4 w-4 text-green-600" />;
    case 'contracts':
      return <FileText className="h-4 w-4 text-purple-600" />;
    case 'subscription_plans':
      return <DollarSign className="h-4 w-4 text-primary" />;
    case 'products':
      return <Package className="h-4 w-4 text-blue-600" />;
    case 'profiles':
    case 'type_user':
      return <User className="h-4 w-4 text-gray-600" />;
    default:
      return <History className="h-4 w-4 text-gray-600" />;
  }
};

// Função auxiliar para renderizar os detalhes das alterações
const renderLogDetails = (log: AuditLog) => {
  const changes: { field: string, old: any, new: any }[] = [];
  
  if (log.operation === 'UPDATE' && log.old_data && log.new_data) {
    // Iterar sobre os novos dados para encontrar as diferenças
    for (const key in log.new_data) {
      // Ignorar colunas de metadados que mudam frequentemente
      // Removendo 'current_uses' da lista de ignorados se for relevante para a tabela
      if (key === 'updated_at' || key === 'logged_at' || key === 'created_at') continue;

      const oldValue = log.old_data[key];
      const newValue = log.new_data[key];

      // Comparação estrita, mas tratando null/undefined
      if (String(oldValue) !== String(newValue)) {
        changes.push({
          field: key,
          old: oldValue,
          new: newValue,
        });
      }
    }
  } else if (log.operation === 'INSERT' && log.new_data) {
    // Para INSERT, mostramos apenas que foi criado
    changes.push({ field: 'Registro', old: 'N/A', new: 'Criado' });
  } else if (log.operation === 'DELETE' && log.old_data) {
    // Para DELETE, mostramos que foi deletado
    changes.push({ field: 'Registro', old: 'Deletado', new: 'N/A' });
  }

  if (changes.length === 0 && log.operation === 'UPDATE') {
    return <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Nenhuma alteração significativa registrada.</p>;
  }

  return (
    <div className="text-xs space-y-1 mt-2 p-2 bg-gray-100 rounded dark:bg-gray-700">
      {changes.map((change, index) => (
        <div key={index} className="flex justify-between items-center">
          <span className="font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[30%]">{change.field}:</span>
          <span className="text-gray-600 dark:text-gray-400 truncate max-w-[30%]">{change.old !== null && change.old !== undefined ? String(change.old) : 'NULL'}</span>
          <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className="text-gray-900 dark:text-white font-medium truncate max-w-[30%]">{change.new !== null && change.new !== undefined ? String(change.new) : 'NULL'}</span>
        </div>
      ))}
    </div>
  );
};


const RecentAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Incluindo old_data na seleção
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, logged_at, table_name, operation, user_id, old_data, new_data')
        .order('logged_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data as AuditLog[]);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      showError('Erro ao carregar logs de auditoria: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) {
    return <p className="text-center text-gray-600 p-4">Carregando logs...</p>;
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
          <History className="h-6 w-6 text-gray-600" />
          Atividade Recente do Sistema (Logs)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-4 pr-4">
            {logs.length === 0 ? (
              <p className="text-gray-600 text-sm">Nenhuma atividade registrada recentemente.</p>
            ) : (
              logs.map((log) => {
                const dateFormatted = format(parseISO(log.logged_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
                const recordId = log.new_data?.id || log.new_data?.user_id || log.new_data?.company_id || log.id;
                const operationColor = log.operation === 'UPDATE' ? 'text-blue-600' : log.operation === 'INSERT' ? 'text-green-600' : 'text-red-600';
                
                let description = `Registro ${recordId.substring(0, 8)}...`;
                if (log.table_name === 'companies' && log.new_data?.name) {
                    description = `Empresa: ${log.new_data.name}`;
                } else if (log.table_name === 'profiles' && log.new_data?.first_name) {
                    description = `Perfil: ${log.new_data.first_name} ${log.new_data.last_name}`;
                } else if (log.table_name === 'subscription_plans' && log.new_data?.name) {
                    description = `Plano: ${log.new_data.name}`;
                }

                return (
                  <div key={log.id} className="flex flex-col p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {getIconForTable(log.table_name)}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            <span className={`${operationColor} font-bold mr-1`}>{log.operation}</span> em {log.table_name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{dateFormatted}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Por: {log.user_id ? `${log.user_id.substring(0, 8)}...` : 'Sistema'}</p>
                      </div>
                    </div>
                    {/* Detalhes da Alteração */}
                    {renderLogDetails(log)}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default RecentAuditLogs;