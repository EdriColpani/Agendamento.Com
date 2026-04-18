import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { formatZipCodeInput } from '@/utils/validation';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { Textarea } from '@/components/ui/textarea';

// Zod schema for client editing
const editClientSchema = z.object({
  name: z.string().min(1, "Nome completo é obrigatório."),
  phone: z.string()
    .min(1, "Telefone é obrigatório.")
    .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Formato de telefone inválido (ex: (XX) XXXXX-XXXX)"),
  email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  birth_date: z.string()
    .min(1, "Data de nascimento é obrigatória.")
    .refine((val) => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(val)) {
        return false;
      }
      const birthDate = new Date(val);
      if (isNaN(birthDate.getTime())) {
        return false;
      }
      const year = birthDate.getFullYear();
      if (String(year).length !== 4) {
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return birthDate <= today;
    }, "Data de nascimento inválida, ano deve ter 4 dígitos e não pode ser no futuro."),
  
  zip_code: z.string()
    .min(1, "CEP é obrigatório.")
    .regex(/^\d{5}-\d{3}$/, "Formato de CEP inválido (ex: XXXXX-XXX)"),
  state: z.string().min(1, "Estado é obrigatório."),
  city: z.string().min(1, "Cidade é obrigatória."),
  address: z.string().min(1, "Endereço é obrigatório."),
  number: z.string().min(1, "Número é obrigatório."),
  neighborhood: z.string().min(1, "Bairro é obrigatório."),
  complement: z.string().optional(),

  observations: z.string().max(500, "Máximo de 500 caracteres.").optional(),
  status: z.string().optional(),
  points: z.preprocess(
    (val) => (val === '' ? undefined : Number(val)),
    z.number().min(0, "Pontos não podem ser negativos.").optional()
  ),
});

type EditClientFormValues = z.infer<typeof editClientSchema>;

const EditClientPage: React.FC = () => {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>(); // Get client ID from URL
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [loading, setLoading] = useState(true); // Start loading for data fetch

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EditClientFormValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      birth_date: '',
      zip_code: '',
      state: '',
      city: '',
      address: '',
      number: '',
      neighborhood: '',
      complement: '',
      observations: '',
      status: 'novo',
      points: 0,
    },
  });

  const phoneValue = watch('phone');
  const zipCodeValue = watch('zip_code');
  const stateValue = watch('state');
  const statusValue = watch('status');

  const fetchClientData = useCallback(async () => {
    if (!clientId || sessionLoading || loadingPrimaryCompany) {
      return;
    }

    if (!session?.user || !primaryCompanyId) {
      showError('Você precisa estar logado e ter uma empresa primária para editar clientes.');
      navigate('/login');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*') // Select all fields to pre-fill
      .eq('id', clientId)
      .eq('company_id', primaryCompanyId) // Ensure user can only edit clients from their primary company
      .single();

    if (error) {
      showError('Erro ao carregar dados do cliente: ' + error.message);
      console.error('Error fetching client data:', error);
      navigate('/clientes'); // Redirect if client not found or error
    } else if (data) {
      setValue('name', data.name || '');
      setValue('phone', formatPhoneNumberInput(data.phone || ''));
      setValue('email', data.email || '');
      setValue('birth_date', data.birth_date || '');
      setValue('zip_code', formatZipCodeInput(data.zip_code || ''));
      setValue('state', data.state || '');
      setValue('city', data.city || '');
      setValue('address', data.address || '');
      setValue('number', data.number || '');
      setValue('neighborhood', data.neighborhood || '');
      setValue('complement', data.complement || '');
      setValue('observations', data.observations || '');
      setValue('status', data.status || 'novo');
      setValue('points', data.points || 0);
    }
    setLoading(false);
  }, [clientId, session, primaryCompanyId, sessionLoading, loadingPrimaryCompany, navigate, setValue]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const formatPhoneNumberInput = (value: string) => {
    if (!value) return '';
    let cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 11) cleaned = cleaned.substring(0, 11);

    if (cleaned.length <= 2) {
      return `(${cleaned}`;
    } else if (cleaned.length <= 7) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2)}`;
    } else if (cleaned.length <= 11) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
    }
    return cleaned;
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatPhoneNumberInput(e.target.value);
    setValue('phone', formattedValue, { shouldValidate: true });
  };

  const clearAddressFields = () => {
    setValue('address', '');
    setValue('neighborhood', '');
    setValue('city', '');
    setValue('state', '');
  };

  const handleZipCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formattedValue = formatZipCodeInput(rawValue);
    setValue('zip_code', formattedValue, { shouldValidate: true });

    const cleanedCep = rawValue.replace(/\D/g, '');

    if (cleanedCep.length === 8) {
      setLoading(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        const data = await response.json();

        if (data.erro) {
          showError('CEP não encontrado.');
          clearAddressFields();
          setError('zip_code', { type: 'manual', message: 'CEP não encontrado.' });
        } else {
          setValue('address', data.logradouro || '');
          setValue('neighborhood', data.bairro || '');
          setValue('city', data.localidade || '');
          setValue('state', data.uf || '');
          clearErrors(['address', 'neighborhood', 'city', 'state', 'zip_code']);
          showSuccess('Endereço preenchido automaticamente!');
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
        showError('Erro ao buscar CEP. Tente novamente.');
        clearAddressFields();
      } finally {
        setLoading(false);
      }
    } else if (cleanedCep.length < 8) {
      clearErrors('zip_code');
    }
  };

  const onSubmit = async (data: EditClientFormValues) => {
    setLoading(true);

    if (sessionLoading || loadingPrimaryCompany) {
      showError('Aguarde o carregamento da sessão e da empresa primária.');
      setLoading(false);
      return;
    }

    if (!session?.user || !primaryCompanyId || !clientId) {
      showError('Erro de autenticação ou dados da empresa/cliente faltando.');
      setLoading(false);
      navigate('/login');
      return;
    }

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          name: data.name,
          phone: data.phone.replace(/\D/g, ''), // Clean phone number for DB
          email: data.email,
          birth_date: data.birth_date,
          zip_code: data.zip_code.replace(/\D/g, ''), // Clean zip code for DB
          state: data.state,
          city: data.city,
          address: data.address,
          number: data.number,
          neighborhood: data.neighborhood,
          complement: data.complement,
          observations: data.observations,
          status: data.status,
          points: data.points,
        })
        .eq('id', clientId)
        .eq('company_id', primaryCompanyId); // Ensure user can only update clients from their primary company

      if (error) {
        throw error;
      }

      showSuccess('Cliente atualizado com sucesso!');
      navigate('/clientes');
    } catch (error: any) {
      console.error('Erro ao atualizar cliente:', error);
      showError('Erro ao atualizar cliente: ' + (error.message || 'Erro desconhecido.'));
    } finally {
      setLoading(false);
    }
  };

  const statesOptions = [
    { value: 'AC', label: 'Acre' }, { value: 'AL', label: 'Alagoas' }, { value: 'AP', label: 'Amapá' },
    { value: 'AM', label: 'Amazonas' }, { value: 'BA', label: 'Bahia' }, { value: 'CE', label: 'Ceará' },
    { value: 'DF', label: 'Distrito Federal' }, { value: 'ES', label: 'Espírito Santo' },
    { value: 'GO', label: 'Goiás' }, { value: 'MA', label: 'Maranhão' }, { value: 'MT', label: 'Mato Grosso' },
    { value: 'MS', label: 'Mato Grosso do Sul' }, { value: 'MG', label: 'Minas Gerais' },
    { value: 'PA', label: 'Pará' }, { value: 'PB', label: 'Paraíba' }, { value: 'PR', label: 'Paraná' },
    { value: 'PE', label: 'Pernambuco' }, { value: 'PI', label: 'Piauí' }, { value: 'RJ', label: 'Rio de Janeiro' },
    { value: 'RN', label: 'Rio Grande do Norte' }, { value: 'RS', label: 'Rio Grande do Sul' },
    { value: 'RO', label: 'Rondônia' }, { value: 'RR', label: 'Roraima' }, { value: 'SC', label: 'Santa Catarina' },
    { value: 'SP', label: 'São Paulo' }, { value: 'SE', label: 'Sergipe' }, { value: 'TO', label: 'Tocantins' }
  ];

  if (loading || sessionLoading || loadingPrimaryCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando dados do cliente...</p>
      </div>
    );
  }

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
        <h1 className="text-3xl font-bold text-gray-900">Editar Cliente</h1>
      </div>
      <div className="max-w-2xl">
        <Card className="border-gray-200">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">
                    Nome Completo *
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Digite o nome completo"
                    {...register('name')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="phone">
                    Telefone *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(XX) XXXXX-XXXX"
                    value={phoneValue}
                    onChange={handlePhoneNumberChange}
                    maxLength={15}
                    className="mt-1 border-gray-300 text-sm"
                    required
                  />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">
                    E-mail *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="cliente@email.com"
                    {...register('email')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <Label htmlFor="birth_date">
                    Data de Nascimento *
                  </Label>
                  <Input
                    id="birth_date"
                    type="date"
                    {...register('birth_date')}
                    className="mt-1 border-gray-300 text-sm"
                    max={new Date().toISOString().split('T')[0]} // Define a data máxima como hoje
                  />
                  {errors.birth_date && <p className="text-red-500 text-xs mt-1">{errors.birth_date.message}</p>}
                </div>
              </div>

              {/* Campos de endereço */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Endereço</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="zip_code" className="text-sm font-medium text-gray-700 dark:text-gray-300">CEP *</Label>
                    <Input
                      id="zip_code"
                      type="text"
                      placeholder="XXXXX-XXX"
                      value={zipCodeValue}
                      onChange={handleZipCodeChange}
                      maxLength={9}
                      className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
                    />
                    {errors.zip_code && <p className="text-red-500 text-xs mt-1">{errors.zip_code.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-sm font-medium text-gray-700 dark:text-gray-300">Estado *</Label>
                    <Select onValueChange={(value) => setValue('state', value, { shouldValidate: true })} value={stateValue}>
                      <SelectTrigger id="state" className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:text-white">
                        {statesOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="city" className="text-sm font-medium text-gray-700 dark:text-gray-300">Cidade *</Label>
                    <Input
                      id="city"
                      type="text"
                      placeholder="Sua cidade"
                      {...register('city')}
                      className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
                    />
                    {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="address" className="text-sm font-medium text-gray-700 dark:text-gray-300">Endereço *</Label>
                    <Input
                      id="address"
                      type="text"
                      placeholder="Rua, Avenida, etc."
                      {...register('address')}
                      className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
                    />
                    {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="number" className="text-sm font-medium text-gray-700 dark:text-gray-300">Número *</Label>
                    <Input
                      id="number"
                      type="text"
                      placeholder="123"
                      {...register('number')}
                      className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
                    />
                    {errors.number && <p className="text-red-500 text-xs mt-1">{errors.number.message}</p>}
                  </div>
                </div>

                <div className="mt-4">
                  <Label htmlFor="neighborhood" className="text-sm font-medium text-gray-700 dark:text-gray-300">Bairro *</Label>
                  <Input
                    id="neighborhood"
                    type="text"
                    placeholder="Seu bairro"
                    {...register('neighborhood')}
                    className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
                  />
                  {errors.neighborhood && <p className="text-red-500 text-xs mt-1">{errors.neighborhood.message}</p>}
                </div>

                <div className="mt-4">
                  <Label htmlFor="complement" className="text-sm font-medium text-gray-700 dark:text-gray-300">Complemento (opcional)</Label>
                  <Input
                    id="complement"
                    type="text"
                    placeholder="Apto, Sala, Bloco"
                    {...register('complement')}
                    className="mt-2 h-10 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-primary focus:ring-primary"
                  />
                  {errors.complement && <p className="text-red-500 text-xs mt-1">{errors.complement.message}</p>}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurações do Cliente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="status">
                      Status do Cliente
                    </Label>
                    <Select onValueChange={(value) => setValue('status', value, { shouldValidate: true })} value={statusValue}>
                      <SelectTrigger id="status" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-1">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="novo">Novo Cliente</SelectItem>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="vip">VIP</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="points">
                      Pontos
                    </Label>
                    <Input
                      id="points"
                      type="number"
                      {...register('points')}
                      className="mt-1 border-gray-300 text-sm"
                      min="0"
                    />
                    {errors.points && <p className="text-red-500 text-xs mt-1">{errors.points.message}</p>}
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="observations">
                    Observações
                  </Label>
                  <Textarea
                    id="observations"
                    placeholder="Observações sobre o cliente..."
                    {...register('observations')}
                    rows={3}
                    maxLength={500}
                    className="mt-1 border-gray-300 text-sm resize-none"
                  />
                  {errors.observations && <p className="text-red-500 text-xs mt-1">{errors.observations.message}</p>}
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
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EditClientPage;