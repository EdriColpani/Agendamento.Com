import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Tag, Clock, CheckCircle, XCircle, History, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AdminCouponFormModal from '@/components/AdminCouponFormModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';

interface AdminCoupon {
  id: string;
  code: string;
  discount_type: 'percentual' | 'fixed';
  discount_value: number;
  valid_until: string | null;
  max_uses: number;
  current_uses: number;
  status: 'active' | 'inactive' | 'expired';
  plan_id: string | null;
  billing_period?: 'any' | 'monthly' | 'yearly';
  created_at: string;
}

interface AuditLog {
  id: string;
  logged_at: string;
  operation: string;
  user_id: string;
  old_data: any;
  new_data: any;
}

const AdminCouponManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<AdminCoupon | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<string | null>(null);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all coupons (RLS ensures only Global Admin can see all)
      const { data, error } = await supabase
        .from('admin_coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Update status if expired based on valid_until date
      const updatedCoupons = data.map(coupon => {
        if (coupon.status === 'active' && coupon.valid_until && isPast(parseISO(coupon.valid_until))) {
          return { ...coupon, status: 'expired' as const };
        }
        return coupon;
      });

      setCoupons(updatedCoupons as AdminCoupon[]);
    } catch (error: any) {
      console.error('Error fetching admin coupons:', error);
      showError('Erro ao carregar cupons administrativos: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const { data: logsData, error: logsError } = await supabase
        .from('audit_logs')
        .select('id, logged_at, operation, user_id, old_data, new_data')
        .eq('table_name', 'admin_coupons')
        .order('logged_at', { ascending: false })
        .limit(20);

      if (logsError) throw logsError;
      setLogs(logsData as AuditLog[]);
    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      // Não exibe erro crítico, apenas loga
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
    fetchAuditLogs();
  }, [fetchCoupons, fetchAuditLogs]);

  const handleAddCoupon = () => {
    setEditingCoupon(null);
    setIsFormModalOpen(true);
  };

  const handleEditCoupon = (coupon: AdminCoupon) => {
    setEditingCoupon(coupon);
    setIsFormModalOpen(true);
  };

  const handleDeleteClick = (couponId: string) => {
    setCouponToDelete(couponId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (couponToDelete) {
      setLoading(true);
      const { error } = await supabase
        .from('admin_coupons')
        .delete()
        .eq('id', couponToDelete);

      if (error) {
        showError('Erro ao excluir cupom: ' + error.message);
        console.error('Error deleting coupon:', error);
      } else {
        showSuccess('Cupom excluído com sucesso!');
        fetchCoupons();
        fetchAuditLogs(); // Refresh logs after deletion
      }
      setLoading(false);
      setIsDeleteDialogOpen(false);
      setCouponToDelete(null);
    }
  };

  const getStatusBadge = (status: AdminCoupon['status']) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500 text-white flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Ativo</Badge>;
      case 'inactive': return <Badge className="bg-gray-500 text-white flex items-center gap-1"><Clock className="h-3 w-3" /> Inativo</Badge>;
      case 'expired': return <Badge className="bg-red-500 text-white flex items-center gap-1"><XCircle className="h-3 w-3" /> Expirado</Badge>;
      default: return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const formatDiscount = (coupon: AdminCoupon) => {
    if (coupon.discount_type === 'percentual') {
      return `${coupon.discount_value}% OFF`;
    }
    return `R$ ${coupon.discount_value.toFixed(2).replace('.', ',')} OFF`;
  };

  const renderLogDetails = (log: AuditLog) => {
    const changes: { field: string, old: any, new: any }[] = [];
    
    if (log.operation === 'UPDATE' && log.old_data && log.new_data) {
      for (const key in log.new_data) {
        // REMOVIDO 'current_uses' da lista de ignorados para que as alterações de uso sejam registradas.
        if (key === 'updated_at' || key === 'logged_at' || key === 'created_at') continue;

        const oldValue = log.old_data[key];
        const newValue = log.new_data[key];

        if (String(oldValue) !== String(newValue)) {
          changes.push({
            field: key,
            old: oldValue,
            new: newValue,
          });
        }
      }
    } else if (log.operation === 'INSERT' && log.new_data) {
      changes.push({ field: 'Código', old: 'N/A', new: log.new_data.code });
    } else if (log.operation === 'DELETE' && log.old_data) {
      changes.push({ field: 'Código', old: log.old_data.code, new: 'Deletado' });
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
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Cupons Administrativos</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal: Lista de Cupons */}
        <Card className="lg:col-span-2 border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-gray-900">Cupons para Proprietários</CardTitle>
            <Button
              className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAddCoupon}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Novo Cupom
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-700">Carregando cupons...</p>
            ) : coupons.length === 0 ? (
              <p className="text-gray-600">Nenhum cupom administrativo cadastrado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Desconto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usos (Max)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Válido Até</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {coupons.map((coupon) => (
                      <tr key={coupon.id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900 flex items-center gap-2">
                          <Tag className="h-4 w-4 text-primary" />
                          {coupon.code}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                          {formatDiscount(coupon)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {coupon.current_uses} / {coupon.max_uses}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {coupon.valid_until ? format(parseISO(coupon.valid_until), 'dd/MM/yyyy', { locale: ptBR }) : 'Ilimitado'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {getStatusBadge(coupon.status)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={() => handleEditCoupon(coupon)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={() => handleDeleteClick(coupon.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coluna Lateral: Logs de Auditoria */}
        <Card className="lg:col-span-1 border-gray-200">
          <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><History className="h-5 w-5" /> Logs de Auditoria</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4 pr-4">
                {logs.length === 0 ? (
                  <p className="text-gray-600 text-sm">Nenhum log de alteração encontrado.</p>
                ) : (
                  logs.map((log) => {
                    const dateFormatted = format(parseISO(log.logged_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
                    const operationColor = log.operation === 'UPDATE' ? 'text-blue-600' : log.operation === 'INSERT' ? 'text-green-600' : 'text-red-600';
                    
                    let description = `ID: ${log.new_data?.id?.substring(0, 8) || log.old_data?.id?.substring(0, 8) || 'N/A'}...`;
                    if (log.new_data?.code) {
                        description = `Cupom: ${log.new_data.code}`;
                    } else if (log.old_data?.code) {
                        description = `Cupom: ${log.old_data.code}`;
                    }

                    return (
                      <div key={log.id} className="border-b pb-3">
                        <div className="flex justify-between items-start">
                          <span className={`font-bold text-sm ${operationColor}`}>
                            {log.operation}
                          </span>
                          <span className="text-xs text-gray-500">
                            {dateFormatted}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">
                          {description}
                        </p>
                        {renderLogDetails(log)}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <AdminCouponFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingCoupon(null);
          fetchCoupons(); // Refresh list after closing modal
          fetchAuditLogs(); // Refresh logs after closing modal
        }}
        editingCoupon={editingCoupon}
        onCouponSaved={() => {
          fetchCoupons();
          fetchAuditLogs();
        }}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este cupom administrativo? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={loading}>
              {loading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCouponManagementPage;