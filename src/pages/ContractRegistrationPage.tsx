import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

// Zod schema for contract registration
const contractSchema = z.object({
  contractName: z.string().min(1, "O nome do contrato é obrigatório."),
  contractContent: z.string().min(1, "O conteúdo do contrato é obrigatório."),
});

type ContractFormValues = z.infer<typeof contractSchema>;

const ContractRegistrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [loading, setLoading] = useState(false);
  const { contractId } = useParams<{ contractId: string }>(); // Get contractId from URL

  const {
    register,
    handleSubmit,
    reset, // Use reset to set form values
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contractName: '',
      contractContent: '',
    },
  });

  const fetchContract = useCallback(async () => {
    if (contractId) {
      setLoading(true);
      const { data, error } = await supabase
        .from('contracts')
        .select('contract_name, contract_content')
        .eq('id', contractId)
        .single();

      if (error) {
        showError('Erro ao carregar contrato: ' + error.message);
        console.error('Error fetching contract:', error);
        navigate('/admin-dashboard'); // Redirect if contract not found or error
      } else if (data) {
        reset({
          contractName: data.contract_name,
          contractContent: data.contract_content,
        });
      }
      setLoading(false);
    }
  }, [contractId, reset, navigate]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  const onSubmit = async (data: ContractFormValues) => {
    setLoading(true);
    if (!session?.user) {
      showError('Você precisa estar logado para cadastrar/atualizar um contrato.');
      setLoading(false);
      return;
    }

    let error;
    if (contractId) {
      // Update existing contract
      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          contract_name: data.contractName,
          contract_content: data.contractContent,
        })
        .eq('id', contractId)
        .eq('user_id', session.user.id); // Ensure user can only update their own contracts
      error = updateError;
    } else {
      // Insert new contract
      const { error: insertError } = await supabase
        .from('contracts')
        .insert({
          user_id: session.user.id,
          contract_name: data.contractName,
          contract_content: data.contractContent,
        });
      error = insertError;
    }

    if (error) {
      showError('Erro ao ' + (contractId ? 'atualizar' : 'cadastrar') + ' contrato: ' + error.message);
      console.error('Error saving contract:', error);
    } else {
      showSuccess('Contrato ' + (contractId ? 'atualizado' : 'cadastrado') + ' com sucesso!');
      navigate('/admin-dashboard'); // Go back to admin dashboard
    }
    setLoading(false);
  };

  const pageTitle = contractId ? 'Editar Contrato' : 'Cadastrar Novo Contrato';
  const buttonText = contractId ? 'Salvar Alterações' : 'Salvar Contrato';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 md:p-8">
        <CardHeader className="relative text-center pb-6">
          <Button
            variant="ghost"
            className="absolute left-0 top-0 !rounded-button whitespace-nowrap text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => navigate('/admin-dashboard')} // Navigate back to admin dashboard
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <CardTitle className="text-3xl font-extrabold text-gray-900 dark:text-white mt-8">
            {pageTitle}
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Preencha os detalhes do contrato.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="contractName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome do Contrato *</Label>
              <Input
                id="contractName"
                type="text"
                placeholder="Ex: Contrato de Prestação de Serviços"
                {...register('contractName')}
                className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
              />
              {errors.contractName && <p className="text-red-500 text-xs mt-1">{errors.contractName.message}</p>}
            </div>
            <div>
              <Label htmlFor="contractContent" className="text-sm font-medium text-gray-700 dark:text-gray-300">Conteúdo do Contrato *</Label>
              <Textarea
                id="contractContent"
                placeholder="Insira o texto completo do contrato aqui..."
                {...register('contractContent')}
                rows={10}
                className="mt-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
              />
              {errors.contractContent && <p className="col-span-4 text-red-500 text-xs mt-1">{errors.contractContent.message}</p>}
            </div>
            <Button
              type="submit"
              className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base"
              disabled={loading}
            >
              {loading ? (contractId ? 'Salvando...' : 'Cadastrando...') : buttonText}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContractRegistrationPage;