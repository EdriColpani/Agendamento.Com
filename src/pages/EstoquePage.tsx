import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from 'react-router-dom';
import { createButton } from '@/lib/dashboard-utils';
import { supabase } from '@/integrations/supabase/client';
import { showOperationError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Edit, Trash2, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Product {
  id: string;
  name: string;
  quantity: number;
  min_stock: number;
  supplier: string | null;
  price: number;
}

const EstoquePage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (sessionLoading || loadingPrimaryCompany) {
      return;
    }

    if (!session?.user || !primaryCompanyId) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, quantity, min_stock, supplier, price')
      .eq('company_id', primaryCompanyId)
      .order('name', { ascending: true });

    if (error) {
      showOperationError('Erro ao carregar produtos.', error);
      console.error('Error fetching products:', error);
      setProducts([]);
    } else if (data) {
      setProducts(data as Product[]);
    }
    setLoadingProducts(false);
  }, [session, primaryCompanyId, sessionLoading, loadingPrimaryCompany]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const lowStockProducts = products.filter(p => p.quantity < p.min_stock);

  const handleDeleteClick = (productId: string) => {
    setProductToDelete(productId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (productToDelete && session?.user && primaryCompanyId) {
      setLoadingProducts(true);
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete)
        .eq('company_id', primaryCompanyId);

      if (error) {
        showOperationError('Erro ao excluir produto.', error);
        console.error('Error deleting product:', error);
      } else {
        showSuccess('Produto excluído com sucesso!');
        fetchProducts(); // Refresh the list
      }
      setLoadingProducts(false);
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  if (sessionLoading || loadingPrimaryCompany || loadingProducts) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando estoque...</p>
      </div>
    );
  }

  if (!session?.user || !primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-gray-700 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para gerenciar o estoque.
        </p>
        <Button
          className="!rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate('/register-company')}
        >
          <i className="fas fa-building mr-2"></i>
          Cadastrar Empresa
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Estoque</h1>
        {createButton(() => navigate('/estoque/new'), 'fas fa-plus', 'Adicionar Produto')}
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <i className="fas fa-exclamation-triangle text-red-600"></i>
            <div>
              <h3 className="font-semibold text-red-800">Atenção: Produtos com Estoque Baixo</h3>
              <p className="text-sm text-red-700">{lowStockProducts.length} produto(s) está(ão) abaixo do estoque mínimo</p>
            </div>
          </div>
        </div>
      )}

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">Produtos em Estoque</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Produto</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Quantidade</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Mínimo</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Fornecedor</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Preço</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-600">Nenhum produto cadastrado.</td>
                  </tr>
                ) : (
                  products.map((item) => {
                    const isLowStock = item.quantity < item.min_stock;
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                              <Package className="text-gray-600 h-5 w-5" />
                            </div>
                            <span className="font-medium text-gray-900">{item.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                            {item.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{item.min_stock}</td>
                        <td className="py-3 px-4 text-gray-600">{item.supplier || 'N/A'}</td>
                        <td className="py-3 px-4 font-semibold text-gray-900">R$ {item.price.toFixed(2).replace('.', ',')}</td>
                        <td className="py-3 px-4">
                          {isLowStock ? (
                            <Badge className="bg-red-500 text-white text-xs">Baixo Estoque</Badge>
                          ) : (
                            <Badge className="bg-green-500 text-white text-xs">Normal</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={() => navigate(`/estoque/edit/${item.id}`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={() => handleDeleteClick(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este produto do estoque? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={loadingProducts}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={loadingProducts}>
              {loadingProducts ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstoquePage;