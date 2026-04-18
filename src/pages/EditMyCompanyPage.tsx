import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building, Save, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatCnpjInput, formatZipCodeInput } from '@/utils/validation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useSession } from '@/components/SessionContextProvider';

// Zod schema for company editing
const companyEditSchema = z.object({
  name: z.string().min(1, "Nome fantasia é obrigatório."),
  razao_social: z.string().min(1, "Razão social é obrigatória."),
  cnpj: z.string().min(1, "CNPJ é obrigatório."),
  ie: z.string().optional(),
  company_email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  phone_number: z.string().min(1, "Telefone é obrigatório."),
  segment_type: z.string().min(1, "Segmento é obrigatório."),
  address: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  complement: z.string().optional(),
  zip_code: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  image_url: z.any().optional(),
});

type CompanyEditFormValues = z.infer<typeof companyEditSchema>;

interface SegmentType {
  id: string;
  name: string;
}

const EditMyCompanyPage: React.FC = () => {
  const navigate = useNavigate();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [segments, setSegments] = useState<SegmentType[]>([]);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CompanyEditFormValues>({
    resolver: zodResolver(companyEditSchema),
    defaultValues: {
      name: '',
      razao_social: '',
      cnpj: '',
      ie: '',
      company_email: '',
      phone_number: '',
      segment_type: '',
      address: '',
      number: '',
      neighborhood: '',
      complement: '',
      zip_code: '',
      city: '',
      state: '',
    },
  });

  const segmentTypeValue = watch('segment_type');
  const imageFile = watch('image_url');

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

  const fetchCompanyData = useCallback(async () => {
    if (!primaryCompanyId || loadingPrimaryCompany) return;

    setLoading(true);
    try {
      // Fetch Company Details
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*') // Select all company fields
        .eq('id', primaryCompanyId)
        .single();

      if (companyError) throw companyError;

      // Fetch Segments
      const { data: segmentsData, error: segmentsError } = await supabase
        .from('segment_types')
        .select('id, name')
        .order('name', { ascending: true });

      if (segmentsError) throw segmentsError;
      setSegments(segmentsData);

      // Set current logo URL
      if (companyData.image_url) {
        setCurrentImageUrl(companyData.image_url);
      }

      // Format data for form
      reset({
        name: companyData.name,
        razao_social: companyData.razao_social,
        cnpj: formatCnpjInput(companyData.cnpj || ''),
        ie: companyData.ie || '',
        company_email: companyData.company_email,
        phone_number: formatPhoneNumberInput(companyData.phone_number || ''),
        segment_type: companyData.segment_type,
        address: companyData.address || '',
        number: companyData.number || '',
        neighborhood: companyData.neighborhood || '',
        complement: companyData.complement || '',
        zip_code: formatZipCodeInput(companyData.zip_code || ''),
        city: companyData.city || '',
        state: companyData.state || '',
      });

    } catch (error: any) {
      console.error('Erro ao carregar dados da empresa:', error);
      showError('Erro ao carregar dados da empresa: ' + error.message);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId, loadingPrimaryCompany, navigate, reset]);

  useEffect(() => {
    fetchCompanyData();
  }, [fetchCompanyData]);

  // Preview do logo quando um arquivo é selecionado
  useEffect(() => {
    if (imageFile && imageFile.length > 0) {
      const file = imageFile[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }, [imageFile]);

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatPhoneNumberInput(e.target.value);
    setValue('phone_number', formattedValue, { shouldValidate: true });
  };

  const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatZipCodeInput(e.target.value);
    setValue('zip_code', formattedValue, { shouldValidate: true });
  };

  const onSubmit = async (data: CompanyEditFormValues) => {
    if (!primaryCompanyId || !session?.user) {
      showError('Erro de autenticação ou empresa primária não encontrada.');
      return;
    }

    setIsSaving(true);

    try {
      const cleanedPhoneNumber = data.phone_number.replace(/\D/g, '');
      const cleanedCnpj = data.cnpj.replace(/\D/g, '');
      const cleanedZipCode = data.zip_code ? data.zip_code.replace(/\D/g, '') : '';

      let imageUrl = currentImageUrl; // Mantém o logo atual por padrão

      // Se um novo logo foi selecionado, fazer upload
      if (data.image_url && data.image_url.length > 0) {
        const file = data.image_url[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        const filePath = `company_logos/${fileName}`;

        // Deletar logo antigo se existir
        if (currentImageUrl) {
          try {
            // Extrair o caminho do arquivo da URL completa
            const urlParts = currentImageUrl.split('/');
            const fileNameIndex = urlParts.findIndex(part => part === 'company_logos') + 1;
            if (fileNameIndex > 0 && fileNameIndex < urlParts.length) {
              const fileName = urlParts.slice(fileNameIndex).join('/');
              await supabase.storage
                .from('company_logos')
                .remove([fileName]);
            }
          } catch (deleteError) {
            console.warn('Erro ao deletar logo antigo:', deleteError);
            // Não bloquear o processo se falhar ao deletar
          }
        }

        const { error: uploadError } = await supabase.storage
          .from('company_logos')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error('Erro ao fazer upload da imagem: ' + uploadError.message);
        }

        const { data: publicUrlData } = supabase.storage
          .from('company_logos')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase
        .from('companies')
        .update({
          name: data.name,
          razao_social: data.razao_social,
          cnpj: cleanedCnpj,
          ie: data.ie,
          company_email: data.company_email,
          phone_number: cleanedPhoneNumber,
          segment_type: data.segment_type,
          address: data.address,
          number: data.number,
          neighborhood: data.neighborhood,
          complement: data.complement,
          zip_code: cleanedZipCode,
          city: data.city,
          state: data.state,
          image_url: imageUrl,
        })
        .eq('id', primaryCompanyId);

      if (error) throw error;

      showSuccess('Dados da empresa atualizados com sucesso!');
      fetchCompanyData(); // Recarregar dados para atualizar o logo exibido
    } catch (error: any) {
      console.error('Erro ao atualizar dados da empresa:', error);
      showError('Erro ao atualizar dados da empresa: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || loadingPrimaryCompany) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando dados da empresa...</p>
      </div>
    );
  }

  if (!primaryCompanyId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-red-500 text-center mb-4">
          Você precisa ter uma empresa primária cadastrada para editar os dados.
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
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="!rounded-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Editar Dados da Empresa</h1>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Building className="h-5 w-5" />
            Dados Cadastrais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Logo da Empresa */}
            <div className="space-y-2">
              <Label htmlFor="image_url">Logo da Empresa</Label>
              <div className="flex items-center gap-4">
                {(imagePreview || currentImageUrl) && (
                  <div className="relative">
                    <img
                      src={imagePreview || currentImageUrl || ''}
                      alt="Logo atual"
                      className="w-32 h-32 object-contain border border-gray-300 rounded-lg"
                    />
                    {imagePreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white h-6 w-6 rounded-full"
                        onClick={() => {
                          setValue('image_url', undefined);
                          setImagePreview(null);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    id="image_url"
                    type="file"
                    accept="image/*"
                    {...register('image_url')}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Formatos aceitos: JPG, PNG, WEBP. Tamanho máximo: 5MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="razao_social">Razão Social *</Label>
                <Input id="razao_social" {...register('razao_social')} className="mt-1" />
                {errors.razao_social && <p className="text-red-500 text-xs mt-1">{errors.razao_social.message}</p>}
              </div>
              <div>
                <Label htmlFor="name">Nome Fantasia *</Label>
                <Input id="name" {...register('name')} className="mt-1" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input id="cnpj" {...register('cnpj')} disabled className="mt-1 bg-gray-100" />
                {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj.message}</p>}
                <p className="text-xs text-gray-500 mt-1">O CNPJ não pode ser alterado.</p>
              </div>
              <div>
                <Label htmlFor="company_email">E-mail da Empresa *</Label>
                <Input id="company_email" type="email" {...register('company_email')} className="mt-1" />
                {errors.company_email && <p className="text-red-500 text-xs mt-1">{errors.company_email.message}</p>}
              </div>
            </div>
            <div>
              <Label htmlFor="phone_number">Telefone *</Label>
              <Input 
                id="phone_number" 
                type="tel" 
                value={watch('phone_number')}
                onChange={handlePhoneNumberChange}
                maxLength={15}
                className="mt-1" 
              />
              {errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number.message}</p>}
            </div>
            <div>
              <Label htmlFor="segment_type">Segmento *</Label>
              <Select onValueChange={(value) => setValue('segment_type', value, { shouldValidate: true })} value={segmentTypeValue}>
                <SelectTrigger id="segment_type" className="mt-1">
                  <SelectValue placeholder="Selecione o segmento" />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id}>
                      {segment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.segment_type && <p className="text-red-500 text-xs mt-1">{errors.segment_type.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ie">Inscrição Estadual</Label>
                <Input id="ie" {...register('ie')} className="mt-1" />
                {errors.ie && <p className="text-red-500 text-xs mt-1">{errors.ie.message}</p>}
              </div>
              <div>
                <Label htmlFor="zip_code">CEP</Label>
                <Input
                  id="zip_code"
                  {...register('zip_code')}
                  onChange={handleZipCodeChange}
                  maxLength={9}
                  className="mt-1"
                />
                {errors.zip_code && <p className="text-red-500 text-xs mt-1">{errors.zip_code.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" {...register('address')} className="mt-1" />
              {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="number">Número</Label>
                <Input id="number" {...register('number')} className="mt-1" />
                {errors.number && <p className="text-red-500 text-xs mt-1">{errors.number.message}</p>}
              </div>
              <div>
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" {...register('complement')} className="mt-1" />
                {errors.complement && <p className="text-red-500 text-xs mt-1">{errors.complement.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" {...register('neighborhood')} className="mt-1" />
                {errors.neighborhood && <p className="text-red-500 text-xs mt-1">{errors.neighborhood.message}</p>}
              </div>
              <div>
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" {...register('city')} className="mt-1" />
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="state">Estado</Label>
              <Input id="state" {...register('state')} className="mt-1" />
              {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>}
            </div>

            <Button
              type="submit"
              className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 text-base"
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditMyCompanyPage;

