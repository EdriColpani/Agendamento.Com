import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, Building, Clock, CheckCircle, XCircle, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
}

interface CouponUsage {
  id: string;
  used_at: string;
  companies: {
    name: string;
    cnpj: string;
    user_id: string; // Proprietário ID
  } | null;
}

const CouponUsageReportPage: React.FC = () => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [usages, setUsages] = useState<CouponUsage[]>([]);
  const [loadingUsages, setLoadingUsages] = useState(false);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
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

  const fetchUsages = useCallback(async (couponId: string) => {
    setLoadingUsages(true);
    try {
      const { data, error } = await supabase
        .from('coupon_usages')
        .select(`
          id,
          used_at,
          companies(name, cnpj, user_id)
        `)
        .eq('admin_coupon_id', couponId)
        .order('used_at', { ascending: false });

      if (error) throw error;
      setUsages(data as CouponUsage[]);
    } catch (error: any) {
      console.error('Error fetching coupon usages:', error);
      showError('Erro ao carregar usos do cupom: ' + error.message);
      setUsages([]);
    } finally {
      setLoadingUsages(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  useEffect(() => {
    if (selectedCouponId) {
      fetchUsages(selectedCouponId);
    } else {
      setUsages([]);
    }
  }, [selectedCouponId, fetchUsages]);

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

  const selectedCoupon = coupons.find(c => c.id === selectedCouponId);

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
        <h1 className="text-3xl font-bold text-gray-900">Relatório de Uso de Cupons</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Cupons */}
        <Card className="lg:col-span-1 border-gray-200">
          <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><Tag className="h-5 w-5" /> Cupons Cadastrados</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[60vh]">
              <div className="space-y-3 pr-4">
                {loading ? (
                  <p className="text-gray-700">Carregando cupons...</p>
                ) : coupons.length === 0 ? (
                  <p className="text-gray-600 text-sm">Nenhum cupom cadastrado.</p>
                ) : (
                  coupons.map((coupon) => (
                    <div 
                      key={coupon.id} 
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCouponId === coupon.id 
                          ? 'border-primary bg-primary/10 shadow-md' 
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedCouponId(coupon.id)}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900">{coupon.code}</span>
                        {getStatusBadge(coupon.status)}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{formatDiscount(coupon)}</p>
                      <p className="text-xs text-gray-500 mt-1">Usos: {coupon.current_uses} / {coupon.max_uses}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Coluna 2 & 3: Detalhes de Uso */}
        <Card className="lg:col-span-2 border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Empresas que Utilizaram {selectedCoupon ? `(${selectedCoupon.code})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCouponId === null ? (
              <p className="text-gray-600 text-center p-4">Selecione um cupom na lista ao lado para ver os detalhes de uso.</p>
            ) : loadingUsages ? (
              <p className="text-gray-700 text-center p-4">Carregando usos...</p>
            ) : usages.length === 0 ? (
              <p className="text-gray-600 text-center p-4">Nenhuma empresa utilizou este cupom ainda.</p>
            ) : (
              <ScrollArea className="h-[60vh]">
                <div className="space-y-4 pr-4">
                  {usages.map((usage) => (
                    <div key={usage.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <Building className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-bold text-gray-900">{usage.companies?.name || 'Empresa Desconhecida'}</p>
                            <p className="text-sm text-gray-600">CNPJ: {usage.companies?.cnpj || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-700">Utilizado em:</p>
                          <p className="text-sm text-gray-600">{format(parseISO(usage.used_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                        </div>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-blue-600 text-xs mt-2"
                        onClick={() => navigate(`/admin-dashboard/companies/details/${usage.companies?.user_id}`)}
                      >
                        Ver Detalhes da Empresa
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CouponUsageReportPage;