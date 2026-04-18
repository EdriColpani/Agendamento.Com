import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';

// Helper function for numeric preprocessing
const numericPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    return val.replace(',', '.');
  }
  return val;
};

// Zod schema for product registration
const productSchema = z.object({
  name: z.string().min(1, "O nome do produto é obrigatório."),
  description: z.string().optional(),
  price: z.preprocess(
    numericPreprocess,
    z.string()
      .regex(/^\d+(\.\d{1,2})?$/, "Preço inválido. Use formato 0.00 ou 0,00")
      .transform(Number)
      .refine(val => !isNaN(val) && val >= 0, "Preço deve ser um número positivo.")
  ),
  cost: z.preprocess(
    numericPreprocess,
    z.string()
      .regex(/^\d+(\.\d{1,2})?$/, "Custo inválido. Use formato 0.00 ou 0,00")
      .transform(Number)
      .refine(val => !isNaN(val) && val >= 0, "Custo deve ser um número positivo.")
  ),
  quantity: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0, "Quantidade não pode ser negativa.")
  ),
  min_stock: z.preprocess(
    (val) => (val === '' ? 0 : Number(val)),
    z.number().int().min(0, "Estoque mínimo não pode ser negativo.")
  ),
  supplier: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

const ProductFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [loading, setLoading] = useState(false);
  const isEditing = !!productId;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      price: '0.00' as any,
      cost: '0.00' as any,
      quantity: 0,
      min_stock: 0,
      supplier: '',
    },
  });

  const fetchProduct = useCallback(async () => {
    if (productId && primaryCompanyId) {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('name, description, price, cost, quantity, min_stock, supplier')
        .eq('id', productId)
        .eq('company_id', primaryCompanyId)
        .single();

      if (error) {
        showError('Erro ao carregar produto: ' + error.message);
        console.error('Error fetching product:', error);
        navigate('/estoque');
      } else if (data) {
        reset({
          name: data.name,
          description: data.description || '',
          price: data.price.toFixed(2).replace('.', ','),
          cost: data.cost?.toFixed(2).replace('.', ',') || '0.00',
          quantity: data.quantity,
          min_stock: data.min_stock,
          supplier: data.supplier || '',
        });
      }
      setLoading(false);
    }
  }, [productId, primaryCompanyId, reset, navigate]);

  useEffect(() => {
    if (!session && !loadingPrimaryCompany) {
      showError('Você precisa estar logado para gerenciar produtos.');
      navigate('/login');
    }
    if (!primaryCompanyId && !loadingPrimaryCompany && session) {
      showError('Você precisa ter uma empresa primária cadastrada para gerenciar produtos.');
      navigate('/register-company');
    }
    if (isEditing) {
      fetchProduct();
    }
  }, [session, primaryCompanyId, loadingPrimaryCompany, navigate, isEditing, fetchProduct]);

  const onSubmit = async (data: ProductFormValues) => {
    setLoading(true);
    if (!session?.user || !primaryCompanyId) {
      showError('Erro de autenticação ou empresa primária não encontrada.');
      setLoading(false);
      return;
    }

    try {
      let error;
      const payload = {
        name: data.name,
        description: data.description,
        price: data.price,
        cost: data.cost,
        quantity: data.quantity,
        min_stock: data.min_stock,
        supplier: data.supplier,
      };

      if (isEditing) {
        // Update existing product
        const { error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', productId)
          .eq('company_id', primaryCompanyId);
        error = updateError;
      } else {
        // Insert new product
        const { error: insertError } = await supabase
          .from('products')
          .insert({
            ...payload,
            company_id: primaryCompanyId,
          });
        error = insertError;
      }

      if (error) {
        throw error;
      }

      showSuccess('Produto ' + (isEditing ? 'atualizado' : 'cadastrado') + ' com sucesso!');
      navigate('/estoque');
    } catch (error: any) {
      console.error('Erro ao salvar produto:', error);
      showError('Erro ao salvar produto: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingPrimaryCompany || (isEditing && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando informações do produto...</p>
      </div>
    );
  }

  const pageTitle = isEditing ? 'Editar Produto' : 'Adicionar Novo Produto';
  const buttonText = isEditing ? 'Salvar Alterações' : 'Salvar Produto';

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
        <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
      </div>
      <div className="max-w-2xl">
        <Card className="border-gray-200">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label htmlFor="name" className="text-sm font-medium text-gray-700 mb-2">
                  Nome do Produto *
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Ex: Cera Modeladora"
                  {...register('name')}
                  className="mt-1 border-gray-300 text-sm"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="description" className="text-sm font-medium text-gray-700 mb-2">
                  Descrição (Opcional)
                </Label>
                <Textarea
                  id="description"
                  placeholder="Breve descrição do produto..."
                  {...register('description')}
                  rows={3}
                  className="mt-1 border-gray-300 text-sm resize-none"
                />
                {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price" className="text-sm font-medium text-gray-700 mb-2">
                    Preço de Venda (R$) *
                  </Label>
                  <Input
                    id="price"
                    type="text"
                    placeholder="0,00"
                    {...register('price')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
                </div>
                <div>
                  <Label htmlFor="cost" className="text-sm font-medium text-gray-700 mb-2">
                    Custo (R$)
                  </Label>
                  <Input
                    id="cost"
                    type="text"
                    placeholder="0,00"
                    {...register('cost')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.cost && <p className="text-red-500 text-xs mt-1">{errors.cost.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="quantity" className="text-sm font-medium text-gray-700 mb-2">
                    Quantidade em Estoque *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="0"
                    {...register('quantity')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>}
                </div>
                <div>
                  <Label htmlFor="min_stock" className="text-sm font-medium text-gray-700 mb-2">
                    Estoque Mínimo *
                  </Label>
                  <Input
                    id="min_stock"
                    type="number"
                    placeholder="5"
                    {...register('min_stock')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.min_stock && <p className="text-red-500 text-xs mt-1">{errors.min_stock.message}</p>}
                </div>
                <div>
                  <Label htmlFor="supplier" className="text-sm font-medium text-gray-700 mb-2">
                    Fornecedor (Opcional)
                  </Label>
                  <Input
                    id="supplier"
                    type="text"
                    placeholder="Nome do fornecedor"
                    {...register('supplier')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.supplier && <p className="text-red-500 text-xs mt-1">{errors.supplier.message}</p>}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="!rounded-button whitespace-nowrap cursor-pointer flex-1"
                  onClick={() => navigate(-1)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="!rounded-button whitespace-nowrap cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
                  disabled={loading}
                >
                  {loading ? (isEditing ? 'Salvando...' : 'Cadastrando...') : buttonText}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProductFormPage;