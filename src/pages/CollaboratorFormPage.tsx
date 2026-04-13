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
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useCollaboratorLimit } from '@/hooks/useCollaboratorLimit';
import { CollaboratorSetupAlertModal } from '@/components/CollaboratorSetupAlertModal';
import { ALERT_KEYS, hasSeenAlert, markAlertAsSeen } from '@/utils/onboardingAlerts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Users, XCircle } from 'lucide-react';

// Zod schema for collaborator registration
const collaboratorSchema = z.object({
  first_name: z.string().min(1, "Nome é obrigatório."),
  last_name: z.string().min(1, "Sobrenome é obrigatório."),
  email: z.string().email("E-mail inválido.").min(1, "E-mail é obrigatório."),
  phone_number: z.string()
    .min(1, "Número de telefone é obrigatório.")
    .regex(/^\(\d{2}\)\s\d{5}-\d{4}$/, "Formato de telefone inválido (ex: (XX) XXXXX-XXXX)"),
  hire_date: z.string().min(1, "Data de contratação é obrigatória."),
  role_type_id: z.string().min(1, "Função é obrigatória.").transform(Number), // Transforma para número
  // commission_percentage removido do formulário - agora é gerenciado apenas na tela de serviços por colaborador
  // Mantido no schema como opcional para compatibilidade com o backend
  commission_percentage: z.number().default(0).optional(),
  status: z.enum(['Ativo', 'Inativo', 'Férias'], {
    errorMap: () => ({ message: "Status é obrigatório." })
  }),
  avatar_file: z.any()
    .refine((files) => !files || files.length === 0 || files?.[0]?.size <= 5000000, `Tamanho máximo da imagem é 5MB.`)
    .refine((files) => !files || files.length === 0 || files?.[0]?.type.startsWith('image/'), `Apenas arquivos de imagem são aceitos.`)
    .refine((files) => !files || files.length === 0 || files?.[0]?.type !== 'image/gif', `Arquivos GIF não são aceitos para avatares.`)
    .optional(),
});

type CollaboratorFormValues = z.infer<typeof collaboratorSchema>;

interface RoleType {
  id: number;
  description: string;
}

const CollaboratorFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { collaboratorId } = useParams<{ collaboratorId: string }>(); // Get collaboratorId from URL
  const { session, loading: sessionLoading } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const limitInfo = useCollaboratorLimit(); // Hook para verificar limite de colaboradores
  const [loading, setLoading] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [loadingRoleTypes, setLoadingRoleTypes] = useState(true);
  const [currentCollaboratorData, setCurrentCollaboratorData] = useState<any>(null); // State to hold fetched data for editing
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null); // New state for selected file name
  const [showSetupAlert, setShowSetupAlert] = useState(false);
  const [newCollaboratorId, setNewCollaboratorId] = useState<string | null>(null);
  const [newCollaboratorName, setNewCollaboratorName] = useState<string>('');
  const isEditing = !!collaboratorId;

  console.log('Estados de carregamento/sessão:', { loading, sessionLoading, loadingPrimaryCompany, loadingRoleTypes });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CollaboratorFormValues>({
    resolver: zodResolver(collaboratorSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      hire_date: '',
      role_type_id: undefined, // Initialize as undefined for Select
      status: 'Ativo',
      avatar_file: undefined,
    },
  });

  const phoneNumberValue = watch('phone_number');
  const roleTypeIdValue = watch('role_type_id');
  const statusValue = watch('status');

  const fetchRoleTypes = useCallback(async () => {
    setLoadingRoleTypes(true);
    
    try {
      // Buscar todos os role_types onde apresentar = true
      const { data: visibleRoles, error: visibleError } = await supabase
        .from('role_types')
        .select('id, description')
        .eq('apresentar', true)
        .order('description', { ascending: true });

      if (visibleError) {
        throw visibleError;
      }

      let rolesToShow = visibleRoles || [];

      // Se estiver editando e o colaborador tem um role_type_id que não está visível,
      // adicionar esse role_type à lista para não perder o valor ao editar
      if (isEditing && currentCollaboratorData?.role_type_id) {
        const currentRoleId = currentCollaboratorData.role_type_id;
        const isCurrentRoleInList = rolesToShow.some(role => role.id === currentRoleId);

        if (!isCurrentRoleInList) {
          // Buscar o role_type atual mesmo que apresentar = false
          const { data: currentRole, error: currentRoleError } = await supabase
            .from('role_types')
            .select('id, description')
            .eq('id', currentRoleId)
            .maybeSingle();

          if (!currentRoleError && currentRole) {
            // Adicionar o role atual no início da lista
            rolesToShow = [currentRole, ...rolesToShow];
          }
        }
      }

      // Ordenar alfabeticamente por description
      const sortedRoles = rolesToShow.sort((a, b) => 
        a.description.localeCompare(b.description, 'pt-BR')
      );
      
      setRoleTypes(sortedRoles);
    } catch (error: any) {
      showError('Erro ao carregar tipos de função: ' + error.message);
      console.error('Error fetching role types:', error);
      setRoleTypes([]);
    } finally {
      setLoadingRoleTypes(false);
    }
  }, [isEditing, currentCollaboratorData]);

  const fetchCollaborator = useCallback(async () => {
    if (collaboratorId && primaryCompanyId) {
      setLoading(true);
      const { data, error } = await supabase
        .from('collaborators')
        .select('first_name, last_name, email, phone_number, hire_date, role_type_id, status, avatar_url')
        .eq('id', collaboratorId)
        .eq('company_id', primaryCompanyId)
        .single();

      if (error) {
        showError('Erro ao carregar colaborador: ' + error.message);
        console.error('Error fetching collaborator:', error);
        navigate('/colaboradores');
      } else if (data) {
        setCurrentCollaboratorData(data); // Store fetched data
        reset({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone_number: formatPhoneNumberInput(data.phone_number || ''),
          hire_date: data.hire_date || '',
          role_type_id: data.role_type_id?.toString(), // Convert number to string here
          status: data.status as 'Ativo' | 'Inativo' | 'Férias',
          // avatar_file is not pre-filled for security/complexity reasons, user can re-upload
        });
      }
      setLoading(false);
    }
  }, [collaboratorId, primaryCompanyId, reset, navigate]);

  // Buscar role types quando não estiver editando ou quando currentCollaboratorData estiver disponível
  useEffect(() => {
    if (!isEditing || currentCollaboratorData) {
      fetchRoleTypes();
    }
  }, [fetchRoleTypes, isEditing, currentCollaboratorData]);

  useEffect(() => {
    if (!session && !loadingPrimaryCompany) {
      showError('Você precisa estar logado para gerenciar colaboradores.');
      navigate('/login');
    }
    if (!primaryCompanyId && !loadingPrimaryCompany && session) {
      showError('Você precisa ter uma empresa primária cadastrada para gerenciar colaboradores.');
      navigate('/register-company');
    }
    if (isEditing) {
      fetchCollaborator();
    }
  }, [session, primaryCompanyId, loadingPrimaryCompany, navigate, isEditing, fetchCollaborator]);

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
    setValue('phone_number', formattedValue, { shouldValidate: true });
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
          }, 'image/png'); // PNG não tem parâmetro de qualidade
        };
        img.onerror = (error) => reject(new Error('Erro ao carregar imagem para conversão.'));
        img.src = event.target?.result as string;
      };
      reader.onerror = (error) => reject(new Error('Erro ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
  };
  const onSubmit = async (data: CollaboratorFormValues) => {
    console.log('Dados do formulário no onSubmit:', data);
    setLoading(true);
    if (!session?.user || !primaryCompanyId) {
      showError('Erro de autenticação ou empresa primária não encontrada.');
      setLoading(false);
      return;
    }

    // VALIDAÇÃO: Verificar limite de colaboradores ANTES de salvar (apenas para novos colaboradores)
    if (!isEditing && limitInfo.maxAllowed !== null && limitInfo.maxAllowed > 0) {
      // Se já excede o limite, permitir (grandfathering)
      if (limitInfo.currentCount > limitInfo.maxAllowed) {
        console.log(`CollaboratorFormPage: Empresa já excede o limite (${limitInfo.currentCount} > ${limitInfo.maxAllowed}). Permitindo adicionar (grandfathering).`);
        // Permite continuar - não bloqueia
      } else if (limitInfo.currentCount >= limitInfo.maxAllowed) {
        // Está no limite - bloquear
        showError(`Limite de colaboradores atingido! Seu plano permite até ${limitInfo.maxAllowed} colaboradores ativos. Você já possui ${limitInfo.currentCount}. Faça upgrade do seu plano para cadastrar mais colaboradores.`);
        setLoading(false);
        return;
      }
    }

    // Validação prévia: verificar se o email já está cadastrado como colaborador nesta empresa
    if (!isEditing) {
      try {
        const { data: existingCollaborator, error: checkError } = await supabase
          .from('collaborators')
          .select('id, first_name, last_name, email')
          .eq('email', data.email.trim().toLowerCase())
          .eq('company_id', primaryCompanyId)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          console.warn('Erro ao verificar email existente (continuando):', checkError);
        }

        if (existingCollaborator) {
          const collaboratorName = existingCollaborator.first_name && existingCollaborator.last_name
            ? `${existingCollaborator.first_name} ${existingCollaborator.last_name}`
            : 'um colaborador';
          
          showError(`O e-mail "${data.email}" já está cadastrado para ${collaboratorName} nesta empresa. Por favor, use outro e-mail ou edite o colaborador existente.`);
          
          // Focar no campo de email
          setTimeout(() => {
            const emailInput = document.getElementById('email');
            if (emailInput) {
              emailInput.focus();
              emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
          
          setLoading(false);
          return;
        }
      } catch (validationError: any) {
        console.warn('Erro na validação prévia de email (continuando):', validationError);
        // Continua o processo mesmo se a validação prévia falhar
      }
    }

      let avatarUrl: string | null = null;
    if (data.avatar_file && data.avatar_file.length > 0) {
      const originalFile = data.avatar_file[0];
      
      console.log('Dados do arquivo original para upload:', {
        name: originalFile.name,
        size: originalFile.size, // in bytes
        type: originalFile.type,
      });

      let fileToUpload = originalFile;
      // Converte para PNG se não for PNG (formato mais universalmente aceito)
      if (originalFile.type !== 'image/png') {
        try {
          fileToUpload = await convertToPng(originalFile);
          console.log('Imagem convertida para PNG:', {
            name: fileToUpload.name,
            size: fileToUpload.size,
            type: fileToUpload.type,
          });
        } catch (conversionError: any) {
          console.error('Erro ao converter imagem para PNG:', conversionError);
          showError('Erro ao converter imagem: ' + conversionError.message);
          setLoading(false);
          return;
        }
      }

      const fileName = `${primaryCompanyId}-${data.email}-${Date.now()}.png`;
      const filePath = `collaborator_avatars/${fileName}`;

      // Remove contentType para deixar o Supabase detectar automaticamente
      const { error: uploadError } = await supabase.storage
        .from('collaborator_avatars')
        .upload(filePath, fileToUpload, {
          cacheControl: '3600',
          upsert: false,
          // Não especifica contentType - deixa o Supabase detectar automaticamente
        });

      if (uploadError) {
        console.error('Erro detalhado no upload da imagem:', uploadError);
        showError('Erro ao fazer upload da imagem: ' + uploadError.message);
        setLoading(false);
        return;
      }
      console.log('Upload da imagem concluído com sucesso para o caminho:', filePath);

      const { data: publicUrlData } = supabase.storage
        .from('collaborator_avatars')
        .getPublicUrl(filePath);
      
      console.log('URL pública da imagem:', publicUrlData.publicUrl);
      avatarUrl = publicUrlData.publicUrl;
    }

    try {
      let error;
      if (isEditing) {
        // Update existing collaborator
        const updateData: any = {
          first_name: data.first_name,
          last_name: data.last_name,
          // email: data.email, // Email should not be editable after creation
          phone_number: data.phone_number.replace(/\D/g, ''),
          hire_date: data.hire_date,
          role_type_id: data.role_type_id,
          // commission_percentage não é mais editável aqui - gerenciado apenas na tela de serviços por colaborador
          // Mantém o valor existente no banco (não atualiza)
          status: data.status,
        };

        console.log('Dados de atualização do colaborador para Supabase:', { updateData, collaboratorId, primaryCompanyId });

        if (avatarUrl) { // Only update avatar_url if a new file was uploaded
          updateData.avatar_url = avatarUrl;
        } else if (data.avatar_file && data.avatar_file.length === 0 && currentCollaboratorData?.avatar_url) {
          // If user explicitly cleared the file input and there was an existing avatar, set it to null
          updateData.avatar_url = null;
        }

        const { data: updatedRows, error: updateError } = await supabase
          .from('collaborators')
          .update(updateData)
          .eq('id', collaboratorId)
          .eq('company_id', primaryCompanyId)
          .select('id');

        console.log('Resultado do UPDATE do colaborador:', { updatedRows, updateError });

        // Em alguns cenários (RLS/where não bate), o Supabase pode não retornar erro, mas também não atualiza nenhuma linha.
        if (!updateError && (!updatedRows || updatedRows.length === 0)) {
          showError('Não foi possível salvar: sem permissão para atualizar este colaborador ou colaborador não encontrado para esta empresa.');
          setLoading(false);
          return;
        }

        error = updateError;
      } else {
        // Verificar se é o primeiro colaborador (antes de cadastrar)
        let isFirstCollaborator = false;
        try {
          const { count, error: countError } = await supabase
            .from('collaborators')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', primaryCompanyId)
            .eq('is_arena_system_placeholder', false);

          if (!countError) {
            isFirstCollaborator = (count || 0) === 0;
            console.log('[CollaboratorFormPage] Total de colaboradores antes do cadastro:', count, 'É o primeiro?', isFirstCollaborator);
          }
        } catch (countErr) {
          console.warn('[CollaboratorFormPage] Erro ao contar colaboradores (continuando):', countErr);
        }

        // Call Edge Function to invite and register new collaborator
        // SEGURANÇA: Não enviar companyId - será capturado automaticamente no backend
        console.log('Chamando Edge Function invite-collaborator com:', {
          user_id: session.user.id,
          email: data.email
        });
        
        const response = await supabase.functions.invoke('invite-collaborator', {
          body: JSON.stringify({
            // companyId removido - será capturado automaticamente no backend do usuário logado
            firstName: data.first_name,
            lastName: data.last_name,
            email: data.email,
            phoneNumber: data.phone_number.replace(/\D/g, ''),
            hireDate: data.hire_date,
            roleTypeId: data.role_type_id,
            commissionPercentage: 0, // Comissão agora é gerenciada apenas na tela de serviços por colaborador
            status: data.status,
            avatarUrl: avatarUrl, // Pass the uploaded avatar URL
          }),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.error) {
          console.error('Erro completo da Edge Function (invite-collaborator):', response);

          // Tenta extrair a mensagem real retornada pela Edge Function
          let edgeFunctionErrorMessage = 'Erro ao salvar colaborador. Verifique suas permissões.';

          // Tenta múltiplas formas de extrair a mensagem de erro
          try {
            // Forma 1: response.error.context.data.error (mais comum no Supabase)
            if ((response as any).error?.context?.data?.error) {
              edgeFunctionErrorMessage = (response as any).error.context.data.error;
            }
            // Forma 2: response.error.message
            else if (response.error.message) {
              edgeFunctionErrorMessage = response.error.message;
            }
            // Forma 3: Tentar ler o body da resposta HTTP diretamente (se disponível)
            else {
              const rawResponse: any = (response as any).error?.context?.response;
              if (rawResponse) {
                try {
                  // Tenta ler como texto primeiro
                  if (typeof rawResponse.text === 'function') {
                    const text = await rawResponse.text();
                    try {
                      const parsed = JSON.parse(text);
                      if (parsed.error) {
                        edgeFunctionErrorMessage = parsed.error;
                      }
                    } catch {
                      // Se não for JSON, usa o texto como mensagem
                      if (text) edgeFunctionErrorMessage = text;
                    }
                  }
                } catch (e) {
                  // Ignora erro de parsing
                }
              }
            }
          } catch (e) {
            console.error('Falha ao extrair mensagem de erro da Edge Function:', e);
          }

          console.error('Mensagem de erro extraída da Edge Function:', edgeFunctionErrorMessage);
          
          // Melhorar mensagem de erro de email duplicado para ser mais visível
          const isEmailError = edgeFunctionErrorMessage.toLowerCase().includes('e-mail') || 
                              edgeFunctionErrorMessage.toLowerCase().includes('email') ||
                              edgeFunctionErrorMessage.toLowerCase().includes('já está cadastrado') ||
                              edgeFunctionErrorMessage.toLowerCase().includes('already');
          
          if (isEmailError) {
            // Destacar o erro de email duplicado
            showError(edgeFunctionErrorMessage);
            // Focar no campo de email
            setTimeout(() => {
              const emailInput = document.getElementById('email');
              if (emailInput) {
                emailInput.focus();
                emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
            setLoading(false);
            return;
          }
          
          throw new Error(edgeFunctionErrorMessage);
        }

        // Se foi cadastrado com sucesso e é o primeiro colaborador, preparar para mostrar alerta
        if (isFirstCollaborator && response.data) {
          // A Edge Function retorna collaborator no response.data
          const collaboratorData = (response.data as any)?.collaborator;
          const collaboratorIdFromResponse = collaboratorData?.id;
          const collaboratorName = `${data.first_name} ${data.last_name}`;
          
          if (collaboratorIdFromResponse) {
            setNewCollaboratorId(collaboratorIdFromResponse);
            setNewCollaboratorName(collaboratorName);
            
            // Verificar se já viu o alerta
            const userId = session.user.id;
            const shouldShowAlert = !hasSeenAlert(ALERT_KEYS.FIRST_COLLABORATOR, userId, primaryCompanyId);
            
            if (shouldShowAlert) {
              // Mostrar alerta após um pequeno delay
              setTimeout(() => {
                setShowSetupAlert(true);
              }, 1000);
              // Não navegar imediatamente se for mostrar o alerta
              showSuccess('Colaborador cadastrado com sucesso!');
              reset();
              return;
            }
          }
        }
      }

      if (error) { // This `error` variable is only for the `isEditing` path
        throw error;
      }

      showSuccess('Colaborador ' + (isEditing ? 'atualizado' : 'cadastrado') + ' com sucesso!');
      reset();
      navigate('/colaboradores');
    } catch (error: any) {
      console.error('Erro ao salvar colaborador:', error);
      showError('Erro ao salvar colaborador: ' + (error.message || 'Erro desconhecido.'));
    } finally {
      setLoading(false);
    }
  };

  if (sessionLoading || loadingPrimaryCompany || loadingRoleTypes || (isEditing && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando informações do colaborador...</p>
      </div>
    );
  }

  const pageTitle = isEditing ? 'Editar Colaborador' : 'Adicionar Novo Colaborador';
  const buttonText = isEditing ? 'Salvar Alterações' : 'Salvar Colaborador';

  // Calcular se o botão deve estar desabilitado por limite
  const isLimitBlocked = !isEditing && 
                         !limitInfo.loading && 
                         limitInfo.maxAllowed !== null && 
                         limitInfo.maxAllowed > 0 && 
                         limitInfo.currentCount >= limitInfo.maxAllowed &&
                         limitInfo.currentCount <= limitInfo.maxAllowed; // Não excede, mas está no limite

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

      {/* Banner de Aviso de Limite de Colaboradores */}
      {!isEditing && !limitInfo.loading && limitInfo.maxAllowed !== null && (
        <div className="max-w-2xl">
          {limitInfo.limitReached ? (
            <Alert variant="destructive" className="border-red-500 bg-red-50">
              <XCircle className="h-4 w-4" />
              <AlertTitle className="text-red-900 font-semibold">Limite de Colaboradores Atingido!</AlertTitle>
              <AlertDescription className="text-red-800">
                Seu plano permite até <strong>{limitInfo.maxAllowed}</strong> colaboradores ativos.
                Você já possui <strong>{limitInfo.currentCount}</strong> colaboradores cadastrados.
                <br />
                <Button
                  variant="link"
                  className="p-0 h-auto text-red-800 underline font-semibold mt-2"
                  onClick={() => navigate('/planos')}
                >
                  Faça upgrade do seu plano para cadastrar mais colaboradores →
                </Button>
              </AlertDescription>
            </Alert>
          ) : limitInfo.nearLimit ? (
            <Alert className="border-yellow-500 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertTitle className="text-yellow-900 font-semibold">Você está próximo do limite de colaboradores</AlertTitle>
              <AlertDescription className="text-yellow-800">
                Seu plano permite até <strong>{limitInfo.maxAllowed}</strong> colaboradores ativos.
                Você já possui <strong>{limitInfo.currentCount}</strong> colaboradores ({limitInfo.percentage}% do limite).
                <br />
                <div className="mt-2 w-full bg-yellow-200 rounded-full h-2">
                  <div
                    className="bg-yellow-600 h-2 rounded-full transition-all"
                    style={{ width: `${limitInfo.percentage}%` }}
                  />
                </div>
                <Button
                  variant="link"
                  className="p-0 h-auto text-yellow-800 underline font-semibold mt-2"
                  onClick={() => navigate('/planos')}
                >
                  Considere fazer upgrade do seu plano →
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-blue-200 bg-blue-50">
              <Users className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-900 font-semibold">Colaboradores</AlertTitle>
              <AlertDescription className="text-blue-800">
                Você possui <strong>{limitInfo.currentCount}</strong> de <strong>{limitInfo.maxAllowed}</strong> colaboradores ativos.
                <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${limitInfo.percentage}%` }}
                  />
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="max-w-2xl">
        <Card className="border-gray-200">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name" className="text-sm font-medium text-gray-700 mb-2">
                    Nome *
                  </Label>
                  <Input
                    id="first_name"
                    type="text"
                    placeholder="Nome do colaborador"
                    {...register('first_name')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="last_name" className="text-sm font-medium text-gray-700 mb-2">
                    Sobrenome *
                  </Label>
                  <Input
                    id="last_name"
                    type="text"
                    placeholder="Sobrenome do colaborador"
                    {...register('last_name')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-2">
                  E-mail *
                </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@colaborador.com"
                    {...register('email')}
                    className="mt-1 border-gray-300 text-sm"
                    disabled={isEditing} // Email should not be editable after creation
                  />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div>
                <Label htmlFor="phone_number" className="text-sm font-medium text-gray-700 mb-2">
                  Telefone *
                </Label>
                <Input
                  id="phone_number"
                  type="tel"
                  placeholder="(XX) XXXXX-XXXX"
                  value={phoneNumberValue}
                  onChange={handlePhoneNumberChange}
                  maxLength={15}
                  className="mt-1 border-gray-300 text-sm"
                />
                {errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number.message}</p>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hire_date" className="text-sm font-medium text-gray-700 mb-2">
                    Data de Contratação *
                  </Label>
                  <Input
                    id="hire_date"
                    type="date"
                    {...register('hire_date')}
                    className="mt-1 border-gray-300 text-sm"
                  />
                  {errors.hire_date && <p className="text-red-500 text-xs mt-1">{errors.hire_date.message}</p>}
                </div>
                <div>
                  <Label htmlFor="role_type_id" className="text-sm font-medium text-gray-700 mb-2">
                    Função *
                  </Label>
                  <Select onValueChange={(value) => setValue('role_type_id', value, { shouldValidate: true })} value={roleTypeIdValue?.toString()}>
                    <SelectTrigger id="role_type_id" className="mt-1 border-gray-300 text-sm" disabled={loadingRoleTypes}>
                      <SelectValue placeholder={loadingRoleTypes ? "Carregando funções..." : "Selecione a função"} />
                    </SelectTrigger>
                    <SelectContent>
                      {roleTypes.length === 0 && !loadingRoleTypes ? (
                        <SelectItem value="no-roles" disabled>Nenhuma função disponível.</SelectItem>
                      ) : (
                        roleTypes.map((role) => (
                          <SelectItem key={role.id} value={role.id.toString()}>
                            {role.description}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.role_type_id && <p className="text-red-500 text-xs mt-1">{errors.role_type_id.message}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="status" className="text-sm font-medium text-gray-700 mb-2">
                  Status *
                </Label>
                <Select onValueChange={(value) => setValue('status', value as 'Ativo' | 'Inativo' | 'Férias', { shouldValidate: true })} value={statusValue}>
                  <SelectTrigger id="status" className="mt-1 border-gray-300 text-sm">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                    <SelectItem value="Férias">Férias</SelectItem>
                  </SelectContent>
                </Select>
                {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
              </div>
              <div>
                <Label htmlFor="avatar_file" className="text-sm font-medium text-gray-700 mb-2">
                  Foto do Colaborador (opcional)
                </Label>
                <Input
                  id="avatar_file"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      setValue('avatar_file', files, { shouldValidate: true });
                      setSelectedFileName(files[0].name);
                    } else {
                      setValue('avatar_file', undefined, { shouldValidate: false });
                      setSelectedFileName(null);
                    }
                  }}
                  className="mt-2 file:text-sm file:font-semibold file:bg-yellow-600 file:text-black file:border-none file:rounded-button file:px-4 file:py-2 file:mr-4 hover:file:bg-yellow-700 dark:file:bg-yellow-700 dark:file:text-black dark:text-gray-300 dark:border-gray-600"
                />
                {selectedFileName && <p className="text-sm text-gray-700 mt-2">Arquivo selecionado: <span className="font-medium">{selectedFileName}</span></p>}
                {errors.avatar_file && <p className="text-red-500 text-xs mt-1">{errors.avatar_file.message}</p>}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Qualquer formato de imagem será aceito e convertido automaticamente. Máximo 5MB.</p>
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
                  className="w-full !rounded-button whitespace-nowrap bg-yellow-600 hover:bg-yellow-700 text-black font-semibold py-2.5 text-base flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading || sessionLoading || loadingPrimaryCompany || loadingRoleTypes || isLimitBlocked}
                  title={isLimitBlocked ? 'Limite de colaboradores atingido. Faça upgrade do seu plano.' : ''}
                >
                  {loading || sessionLoading || loadingPrimaryCompany || loadingRoleTypes ? 'Carregando...' : isLimitBlocked ? 'Limite Atingido' : buttonText}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Alerta de Configuração do Primeiro Colaborador */}
      {newCollaboratorId && (
        <CollaboratorSetupAlertModal
          open={showSetupAlert}
          onClose={() => {
            setShowSetupAlert(false);
            navigate('/colaboradores');
          }}
          collaboratorId={newCollaboratorId}
          collaboratorName={newCollaboratorName}
          onGoToSchedule={() => {
            setShowSetupAlert(false);
            navigate(`/colaboradores/${newCollaboratorId}/schedule`);
          }}
          onGoToServices={() => {
            setShowSetupAlert(false);
            navigate(`/colaboradores/${newCollaboratorId}/servicos`);
          }}
          onDontShowAgain={(dontShow) => {
            if (dontShow && session?.user && primaryCompanyId) {
              markAlertAsSeen(ALERT_KEYS.FIRST_COLLABORATOR, session.user.id, primaryCompanyId, true);
            }
          }}
        />
      )}
    </div>
  );
};

export default CollaboratorFormPage;