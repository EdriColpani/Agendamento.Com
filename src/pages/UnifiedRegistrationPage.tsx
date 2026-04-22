import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { validateCnpj, formatCnpjInput, formatZipCodeInput, formatPhoneNumberInput } from '@/utils/validation';
import ContractAcceptanceModal from '@/components/ContractAcceptanceModal';
import { useSession } from '@/components/SessionContextProvider';
import { invokeEdgePublicOrThrow } from '@/utils/edge-invoke';

// Helper function for numeric preprocessing
const numericPreprocess = (val: unknown) => {
  if (typeof val === 'string') {
    return val.replace(',', '.');
  }
  return val;
};

// Zod schema for unified registration
const unifiedRegistrationSchema = z.object({
  // User Fields (Simplified)
  firstName: z.string().min(1, "Nome é obrigatório."),
  lastName: z.string().min(1, "Sobrenome é obrigatório."),
  email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
  confirmPassword: z.string(),
  phoneNumber: z.string()
    .min(1, "Telefone é obrigatório.")
    .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Formato de telefone inválido (ex: (XX) XXXXX-XXXX)"),
  
  // Company Fields
  companyName: z.string().min(1, "Nome fantasia é obrigatório."),
  razaoSocial: z.string().min(1, "Razão social é obrigatória."),
  cnpj: z.string()
    .min(1, "CNPJ é obrigatório.")
    .refine((val) => {
      const cleanedCnpj = val.replace(/[^\d]+/g, '');
      return validateCnpj(cleanedCnpj);
    }, "CNPJ inválido."),
  ie: z.string().optional(),
  companyEmail: z.string().email("E-mail da empresa inválido.").min(1, "E-mail da empresa é obrigatório."),
  companyPhoneNumber: z.string()
    .min(1, "Telefone da empresa é obrigatório.")
    .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Formato de telefone inválido (ex: (XX) XXXXX-XXXX)"),
  segmentType: z.string().min(1, "Segmento é obrigatório."),
  address: z.string().min(1, "Endereço é obrigatório."),
  number: z.string().min(1, "Número é obrigatório."),
  neighborhood: z.string().min(1, "Bairro é obrigatório."),
  complement: z.string().optional(),
  zipCode: z.string()
    .min(1, "CEP é obrigatório.")
    .regex(/^\d{5}-\d{3}$/, "Formato de CEP inválido (ex: XXXXX-XXX)"),
  city: z.string().min(1, "Cidade é obrigatória."),
  state: z.string().min(1, "Estado é obrigatória."),
  companyLogo: z.any()
    .refine((files) => !files || files.length === 0 || files?.[0]?.size <= 5000000, `Tamanho máximo da imagem é 5MB.`)
    .refine((files) => !files || files.length === 0 || files?.[0]?.type.startsWith('image/'), `Apenas arquivos de imagem são aceitos.`)
    .refine((files) => !files || files.length === 0 || files?.[0]?.type !== 'image/gif', `Arquivos GIF não são aceitos para logos.`)
    .optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

type UnifiedRegistrationFormValues = z.infer<typeof unifiedRegistrationSchema>;

interface SegmentOption {
  id: string;
  name: string;
  area_name: string;
}

const UnifiedRegistrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const [loading, setLoading] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [latestContract, setLatestContract] = useState<{ id: string; contract_name: string; contract_content: string } | null>(null);
  const [pendingData, setPendingData] = useState<UnifiedRegistrationFormValues | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [segmentOptions, setSegmentOptions] = useState<SegmentOption[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(true);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<UnifiedRegistrationFormValues>({
    resolver: zodResolver(unifiedRegistrationSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      phoneNumber: '',
      companyName: '',
      razaoSocial: '',
      cnpj: '',
      ie: '',
      companyEmail: '',
      companyPhoneNumber: '',
      segmentType: '',
      address: '',
      number: '',
      neighborhood: '',
      complement: '',
      zipCode: '',
      city: '',
      state: '',
      // Removed default values for CPF, birthDate, gender
    },
  });

  const segmentTypeValue = watch('segmentType');
  const cnpjValue = watch('cnpj');
  const zipCodeValue = watch('zipCode');
  const phoneNumberValue = watch('phoneNumber');
  const companyPhoneNumberValue = watch('companyPhoneNumber');
  const stateValue = watch('state');

  const fetchInitialData = useCallback(async () => {
    // Fetch the latest contract (GLOBAL ACCESS)
    const { data: contractData, error: contractError } = await supabase
      .from('contracts')
      .select('id, contract_name, contract_content')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (contractError && contractError.code !== 'PGRST116') {
      console.error('Error fetching latest contract:', contractError);
      showError('Erro ao carregar o contrato mais recente.');
    } else if (contractData) {
      setLatestContract(contractData);
    } else {
      setLatestContract(null);
    }

    // Fetch segment types and their associated area_de_atuacao name
    setLoadingSegments(true);
    const { data: segmentsData, error: segmentsError } = await supabase
      .from('segment_types')
      .select(`
        id, 
        name,
        area_de_atuacao(name)
      `)
      .order('name', { ascending: true });

    if (segmentsError) {
      showError('Erro ao carregar tipos de segmento: ' + segmentsError.message);
      console.error('Error fetching segment types:', segmentsError);
    } else if (segmentsData) {
      setSegmentOptions(segmentsData.map(segment => ({ 
        id: segment.id, 
        name: segment.name,
        area_name: (segment.area_de_atuacao as { name: string } | null)?.name || 'Geral'
      })));
    }
    setLoadingSegments(false);
  }, []);

  useEffect(() => {
    if (session) {
      // If user is already logged in, redirect them away from this page
      navigate('/', { replace: true });
    }
    fetchInitialData();
  }, [session, navigate, fetchInitialData]);

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'phoneNumber' | 'companyPhoneNumber') => {
    const formattedValue = formatPhoneNumberInput(e.target.value);
    setValue(field, formattedValue, { shouldValidate: true });
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatCnpjInput(e.target.value);
    setValue('cnpj', formattedValue, { shouldValidate: true });
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
    setValue('zipCode', formattedValue, { shouldValidate: true });

    const cleanedCep = rawValue.replace(/\D/g, '');

    if (cleanedCep.length === 8) {
      setLoading(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
        const data = await response.json();

        if (data.erro) {
          showError('CEP não encontrado.');
          clearAddressFields();
          setError('zipCode', { type: 'manual', message: 'CEP não encontrado.' });
        } else {
          setValue('address', data.logradouro || '');
          setValue('neighborhood', data.bairro || '');
          setValue('city', data.localidade || '');
          setValue('state', data.uf || '');
          clearErrors(['address', 'neighborhood', 'city', 'state', 'zipCode']);
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
      clearErrors('zipCode');
    }
  };

  const convertToPng = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const pngFile = new File([blob], file.name.split('.')[0] + '.png', { type: 'image/png' });
              resolve(pngFile);
            } else {
              reject(new Error('Erro ao converter imagem para PNG.'));
            }
          }, 'image/png');
        };
        img.onerror = (error) => reject(new Error('Erro ao carregar imagem para conversão.'));
        img.src = event.target?.result as string;
      };
      reader.onerror = (error) => reject(new Error('Erro ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
  };

  const handleFormSubmit = async (data: UnifiedRegistrationFormValues) => {
    setLoading(true);

    if (!latestContract) {
      showError('Nenhum contrato disponível para aceite. Um administrador precisa criar um contrato nas configurações.');
      setLoading(false);
      return;
    }

    // Convert image to base64 if present
    let imageBase64: string | null = null;
    if (data.companyLogo && data.companyLogo.length > 0) {
      const originalFile = data.companyLogo[0];
      
      // Validate file size (5MB max)
      if (originalFile.size > 5000000) {
        setError('companyLogo', { type: 'manual', message: 'Tamanho máximo da imagem é 5MB.' });
        setLoading(false);
        return;
      }
      
      let fileToConvert = originalFile;
      // Converte para PNG se não for PNG (formato mais universalmente aceito)
      if (originalFile.type !== 'image/png') {
        try {
          fileToConvert = await convertToPng(originalFile);
          console.log('Imagem convertida para PNG:', {
            name: fileToConvert.name,
            size: fileToConvert.size,
            type: fileToConvert.type,
          });
        } catch (conversionError: any) {
          console.error('Erro ao converter imagem para PNG:', conversionError);
          showError('Erro ao converter imagem: ' + conversionError.message);
          setLoading(false);
          return;
        }
      }
      
      const reader = new FileReader();
      
      // Wait for the file to be read
      imageBase64 = await new Promise<string | null>((resolve) => {
        reader.onloadend = () => {
          if (reader.result && typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            console.error('Failed to read file as base64');
            resolve(null);
          }
        };
        reader.onerror = (error) => {
          console.error('Error reading file:', error);
          resolve(null);
        };
        reader.readAsDataURL(fileToConvert);
      });
      
      if (!imageBase64) {
        showError('Erro ao processar a imagem. Por favor, tente novamente.');
        setLoading(false);
        return;
      }
    }
    
    setPendingData(data);
    setPendingImageUrl(imageBase64);
    setIsContractModalOpen(true);
    setLoading(false);
  };

  const handleAcceptAndRegister = async () => {
    setLoading(true);
    if (!pendingData) {
      showError('Erro interno: dados do formulário estão faltando. Por favor, tente novamente.');
      setLoading(false);
      return;
    }

    const data = pendingData;

    // Clean data for Edge Function - create new object without File objects
    const cleanedData: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
      phoneNumber: data.phoneNumber.replace(/\D/g, ''),
      // Placeholder values for missing fields
      cpf: '00000000000', 
      birthDate: '1900-01-01',
      gender: 'Outro',
      // End Placeholder values
      companyName: data.companyName,
      razaoSocial: data.razaoSocial,
      cnpj: data.cnpj.replace(/\D/g, ''),
      ie: data.ie || '',
      companyEmail: data.companyEmail,
      companyPhoneNumber: data.companyPhoneNumber.replace(/\D/g, ''),
      segmentType: data.segmentType,
      address: data.address,
      number: data.number,
      neighborhood: data.neighborhood,
      complement: data.complement || '',
      zipCode: data.zipCode.replace(/\D/g, ''),
      city: data.city,
      state: data.state,
      imageBase64: pendingImageUrl, // Base64 string or null - NO File object
    };

    // Explicitly ensure no File objects are in the data
    if (cleanedData.companyLogo) {
      delete cleanedData.companyLogo;
    }

    // Final verification: ensure no File objects in cleanedData
    const hasFileObjects = Object.values(cleanedData).some(val => val instanceof File || (val && typeof val === 'object' && 'constructor' in val && val.constructor.name === 'File'));
    if (hasFileObjects) {
      console.error('ERROR: File object detected in cleanedData!', cleanedData);
      showError('Erro interno: objeto File detectado nos dados. Por favor, recarregue a página e tente novamente.');
      setLoading(false);
      return;
    }

    // Verify imageBase64 is string or null, not File
    if (cleanedData.imageBase64 && !(typeof cleanedData.imageBase64 === 'string')) {
      console.error('ERROR: imageBase64 is not a string!', typeof cleanedData.imageBase64, cleanedData.imageBase64);
      showError('Erro interno: formato de imagem inválido. Por favor, recarregue a página e tente novamente.');
      setLoading(false);
      return;
    }

    console.log('Sending data to Edge Function (no File objects):', {
      ...cleanedData,
      imageBase64: cleanedData.imageBase64 ? `${cleanedData.imageBase64.substring(0, 50)}...` : null
    });

    try {
      const responseData = await invokeEdgePublicOrThrow<{ email: string }>(
        'register-company-and-user',
        {
          body: cleanedData,
        },
      );
      const { email: registeredEmail } = responseData;

      // Não fazer login automático - usuário precisa confirmar email primeiro
      showSuccess('Cadastro realizado com sucesso! Verifique seu e-mail para confirmar sua conta.');
      
      setIsContractModalOpen(false);
      setPendingData(null);
      setPendingImageUrl(null);
      
      // Redirecionar para página de aviso sobre confirmação de email
      navigate(`/email-confirmation-pending?email=${encodeURIComponent(registeredEmail)}`);
    } catch (error: any) {
      console.error('Erro ao registrar usuário e empresa:', error);
      showError('Erro ao finalizar o cadastro: ' + (error.message || 'Erro desconhecido.'));
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 md:p-8">
        <CardHeader className="relative text-center pb-6">
          <Button
            variant="ghost"
            className="absolute left-0 top-0 !rounded-button whitespace-nowrap text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <CardTitle className="text-3xl font-extrabold text-gray-900 dark:text-white mt-8">
            Cadastro de Profissional e Empresa
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Preencha seus dados pessoais e da sua empresa para começar a usar a plataforma.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
            
            {/* Seção 1: Dados Pessoais */}
            <div className="border-b pb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">1. Seus Dados Pessoais</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">Nome *</Label>
                  <Input id="firstName" {...register('firstName')} className="mt-2 h-10" />
                  {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="lastName">Sobrenome *</Label>
                  <Input id="lastName" {...register('lastName')} className="mt-2 h-10" />
                  {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="email">E-mail (Login) *</Label>
                  <Input id="email" type="email" {...register('email')} className="mt-2 h-10" />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <Label htmlFor="phoneNumber">Telefone *</Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="(XX) XXXXX-XXXX"
                    value={phoneNumberValue}
                    onChange={(e) => handlePhoneNumberChange(e, 'phoneNumber')}
                    maxLength={15}
                    className="mt-2 h-10"
                  />
                  {errors.phoneNumber && <p className="text-red-500 text-xs mt-1">{errors.phoneNumber.message}</p>}
                </div>
                <div>
                  <Label htmlFor="password">Crie uma senha *</Label>
                  <Input id="password" type="password" {...register('password')} className="mt-2 h-10" />
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirme a senha *</Label>
                  <Input id="confirmPassword" type="password" {...register('confirmPassword')} className="mt-2 h-10" />
                  {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
                </div>
              </div>
            </div>

            {/* Seção 2: Dados da Empresa */}
            <div className="border-b pb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">2. Dados da Sua Empresa</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="razaoSocial">Razão Social *</Label>
                  <Input id="razaoSocial" {...register('razaoSocial')} className="mt-2 h-10" />
                  {errors.razaoSocial && <p className="text-red-500 text-xs mt-1">{errors.razaoSocial.message}</p>}
                </div>
                <div>
                  <Label htmlFor="companyName">Nome Fantasia *</Label>
                  <Input id="companyName" {...register('companyName')} className="mt-2 h-10" />
                  {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="cnpj">CNPJ *</Label>
                  <Input
                    id="cnpj"
                    type="text"
                    placeholder="XX.XXX.XXX/XXXX-XX"
                    value={cnpjValue}
                    onChange={handleCnpjChange}
                    maxLength={18}
                    className="mt-2 h-10"
                  />
                  {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj.message}</p>}
                </div>
                <div>
                  <Label htmlFor="ie">Inscrição Estadual (IE)</Label>
                  <Input id="ie" type="text" placeholder="Opcional" {...register('ie')} className="mt-2 h-10" />
                  {errors.ie && <p className="text-red-500 text-xs mt-1">{errors.ie.message}</p>}
                </div>
                <div>
                  <Label htmlFor="companyEmail">E-mail da Empresa *</Label>
                  <Input id="companyEmail" type="email" {...register('companyEmail')} className="mt-2 h-10" />
                  {errors.companyEmail && <p className="text-red-500 text-xs mt-1">{errors.companyEmail.message}</p>}
                </div>
                <div>
                  <Label htmlFor="companyPhoneNumber">Telefone da Empresa *</Label>
                  <Input
                    id="companyPhoneNumber"
                    type="tel"
                    placeholder="(XX) XXXXX-XXXX"
                    value={companyPhoneNumberValue}
                    onChange={(e) => handlePhoneNumberChange(e, 'companyPhoneNumber')}
                    maxLength={15}
                    className="mt-2 h-10"
                  />
                  {errors.companyPhoneNumber && <p className="text-red-500 text-xs mt-1">{errors.companyPhoneNumber.message}</p>}
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="segmentType">Segmento *</Label>
                  <Select onValueChange={(value) => setValue('segmentType', value, { shouldValidate: true })} value={segmentTypeValue}>
                    <SelectTrigger id="segmentType" className="mt-2 h-10" disabled={loadingSegments}>
                      <SelectValue placeholder={loadingSegments ? "Carregando segmentos..." : "Selecione o segmento da empresa"} />
                    </SelectTrigger>
                    <SelectContent>
                      {segmentOptions.length === 0 && !loadingSegments ? (
                        <SelectItem value="no-segments" disabled>Nenhum segmento disponível.</SelectItem>
                      ) : (
                        segmentOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} (Área: {option.area_name})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.segmentType && <p className="text-red-500 text-xs mt-1">{errors.segmentType.message}</p>}
                </div>
              </div>
            </div>

            {/* Seção 3: Endereço */}
            <div className="border-b pb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">3. Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="zipCode">CEP *</Label>
                  <Input
                    id="zipCode"
                    type="text"
                    placeholder="XXXXX-XXX"
                    value={zipCodeValue}
                    onChange={handleZipCodeChange}
                    maxLength={9}
                    className="mt-2 h-10"
                  />
                  {errors.zipCode && <p className="text-red-500 text-xs mt-1">{errors.zipCode.message}</p>}
                </div>
                <div>
                  <Label htmlFor="state">Estado *</Label>
                  <Select onValueChange={(value) => setValue('state', value, { shouldValidate: true })} value={stateValue}>
                    <SelectTrigger id="state" className="mt-2 h-10">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
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
                  <Label htmlFor="city">Cidade *</Label>
                  <Input id="city" type="text" placeholder="Sua cidade" {...register('city')} className="mt-2 h-10" />
                  {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="md:col-span-2">
                  <Label htmlFor="address">Endereço *</Label>
                  <Input id="address" type="text" placeholder="Rua, Avenida, etc." {...register('address')} className="mt-2 h-10" />
                  {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
                </div>
                <div>
                  <Label htmlFor="number">Número *</Label>
                  <Input id="number" type="text" placeholder="123" {...register('number')} className="mt-2 h-10" />
                  {errors.number && <p className="text-red-500 text-xs mt-1">{errors.number.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="neighborhood">Bairro *</Label>
                  <Input id="neighborhood" type="text" placeholder="Seu bairro" {...register('neighborhood')} className="mt-2 h-10" />
                  {errors.neighborhood && <p className="text-red-500 text-xs mt-1">{errors.neighborhood.message}</p>}
                </div>
                <div>
                  <Label htmlFor="complement">Complemento (opcional)</Label>
                  <Input id="complement" type="text" placeholder="Apto, Sala, Bloco" {...register('complement')} className="mt-2 h-10" />
                  {errors.complement && <p className="text-red-500 text-xs mt-1">{errors.complement.message}</p>}
                </div>
              </div>
            </div>

            {/* Seção 4: Logo */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">4. Logo da Empresa (Opcional)</h3>
              <Label htmlFor="companyLogo">Logo da Empresa (opcional)</Label>
              <Input
                id="companyLogo"
                type="file"
                accept="image/*"
                {...register('companyLogo')}
                className="mt-2 file:text-sm file:font-semibold file:bg-primary file:text-black file:border-none file:rounded-button file:px-4 file:py-2 file:mr-4 hover:file:bg-primary/90 dark:file:bg-primary/90 dark:file:text-black dark:text-gray-300 dark:border-gray-600"
              />
              {errors.companyLogo && <p className="text-red-500 text-xs mt-1">{errors.companyLogo.message}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Qualquer formato de imagem será aceito e convertido automaticamente. Máximo 5MB.</p>
            </div>

            <Button
              type="submit"
              className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base"
              disabled={loading || loadingSegments}
            >
              {loading || loadingSegments ? 'Carregando...' : 'Revisar e Aceitar Contrato'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {latestContract && (
        <ContractAcceptanceModal
          isOpen={isContractModalOpen}
          onClose={() => {
            setIsContractModalOpen(false);
            setPendingData(null);
            setPendingImageUrl(null);
            setLoading(false);
          }}
          contract={latestContract}
          onAccept={handleAcceptAndRegister}
          loading={loading}
        />
      )}
    </div>
  );
};

export default UnifiedRegistrationPage;