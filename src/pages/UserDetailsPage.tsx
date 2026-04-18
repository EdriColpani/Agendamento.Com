import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Building, Briefcase, Calendar, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Profile {
  first_name: string;
  last_name: string;
  phone_number: string;
  cpf: string;
  birth_date: string;
  gender: string;
}

interface UserType {
  cod: string;
  descr: string;
}

interface UserCompany {
  company_id: string;
  company_name: string;
  role_type_description: string;
  is_primary: boolean;
}

interface UserDetails {
  id: string;
  email: string;
  created_at: string;
  profile: Profile | null;
  userType: UserType | null;
  companies: UserCompany[];
}

const UserDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserDetails = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // 1. Buscar tipo de usuário (sem depender de relacionamento implícito com auth_users)
      const { data: userTypeData, error: typeError } = await supabase
        .from('type_user')
        .select('user_id, cod, descr')
        .eq('user_id', userId)
        .single();

      if (typeError && typeError.code !== 'PGRST116') throw typeError;

      if (!userTypeData) {
        throw new Error('Usuário não encontrado ou sem tipo de usuário definido.');
      }

      // 2. Buscar dados de auth (email/created_at) via view auth_users ou Edge Function
      let authUser: any = null;
      
      // Tentar primeiro via view auth_users
      const { data: viewData, error: viewError } = await supabase
        .from('auth_users')
        .select('id, email, created_at')
        .eq('id', userId)
        .single();

      if (viewError && viewError.code !== 'PGRST116') {
        // Se a view não existe, usar Edge Function como fallback
        console.warn('[UserDetailsPage] View auth_users não disponível, usando Edge Function:', viewError.message);
        
        const { data: functionResponse, error: functionError } = await supabase.functions.invoke('get-user-auth-data', {
          body: { user_ids: [userId] },
        });

        if (functionError) {
          console.warn('[UserDetailsPage] Erro ao buscar dados de auth via Edge Function:', functionError);
          // Continua sem dados de auth
        } else if (functionResponse?.data && functionResponse.data.length > 0) {
          authUser = functionResponse.data[0];
        }
      } else if (viewData) {
        authUser = viewData;
      }
      
      // 3. Buscar dados de perfil separadamente
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number, cpf, birth_date, gender')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        // If profile is missing, it's not a critical error, just log it
        console.warn('Profile data missing for user:', userId, profileError);
      }

      // 4. Buscar empresas/roles via RPC
      const { data: companyContext, error: companyError } = await supabase
        .rpc('get_user_context', { p_user_id: userId });

      if (companyError) throw companyError;

      setUserDetails({
        id: userId,
        email: authUser?.email || 'N/A',
        created_at: authUser?.created_at || 'N/A',
        profile: profileData as Profile,
        userType: { cod: userTypeData.cod, descr: userTypeData.descr },
        companies: companyContext as UserCompany[],
      });

    } catch (error: any) {
      console.error('[UserDetailsPage] Erro ao carregar detalhes do usuário:', error);
      showError('Erro ao carregar detalhes do usuário: ' + error.message);
      navigate('/admin-dashboard/users');
    } finally {
      setLoading(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    fetchUserDetails();
  }, [fetchUserDetails]);

  const getRoleColor = (cod: string) => {
    switch (cod) {
      case 'GLOBAL_ADMIN': return 'bg-red-600 text-white';
      case 'PROPRIETARIO': return 'bg-primary text-primary-foreground';
      case 'CLIENTE': return 'bg-blue-600 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando detalhes do usuário...</p>
      </div>
    );
  }

  if (!userDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Detalhes do usuário não encontrados.</p>
      </div>
    );
  }

  const profile = userDetails.profile;
  const userType = userDetails.userType;
  const displayName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : userDetails.email;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          className="!rounded-button cursor-pointer"
          onClick={() => navigate('/admin-dashboard/users')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Usuários
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Detalhes do Usuário: {displayName}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal: Detalhes do Perfil e Tipo */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-gray-200">
            <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><User className="h-5 w-5" /> Informações Básicas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Nome Completo</Label>
                  <p className="mt-1 text-gray-900 font-semibold">{displayName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">E-mail</Label>
                  <p className="mt-1 text-gray-900 flex items-center gap-2"><Mail className="h-4 w-4 text-gray-500" /> {userDetails.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Telefone</Label>
                  <p className="mt-1 text-gray-900 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" /> 
                    {profile?.phone_number ? `(${profile.phone_number.substring(0,2)}) ${profile.phone_number.substring(2,7)}-${profile.phone_number.substring(7)}` : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">CPF</Label>
                  <p className="mt-1 text-gray-900">{profile?.cpf ? `${profile.cpf.substring(0,3)}.${profile.cpf.substring(3,6)}.${profile.cpf.substring(6,9)}-${profile.cpf.substring(9)}` : 'N/A'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Data de Nascimento</Label>
                  <p className="mt-1 text-gray-900 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" /> 
                    {profile?.birth_date ? format(parseISO(profile.birth_date), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Gênero</Label>
                  <p className="mt-1 text-gray-900">{profile?.gender || 'N/A'}</p>
                </div>
              </div>
              <div className="border-t pt-4">
                <Label className="text-sm font-medium text-gray-700">Tipo de Usuário</Label>
                <div className="mt-2">
                  <Badge className={getRoleColor(userType?.cod || 'N/A')}>
                    <Zap className="h-4 w-4 mr-1" />
                    {userType?.descr || 'Desconhecido'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200">
            <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><Briefcase className="h-5 w-5" /> Ações Administrativas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full !rounded-button"
                onClick={() => showError('Funcionalidade de redefinição de senha em desenvolvimento.')}
              >
                Redefinir Senha (Admin)
              </Button>
              <Button 
                variant="destructive" 
                className="w-full !rounded-button"
                onClick={() => showError('Funcionalidade de exclusão de usuário em desenvolvimento.')}
              >
                Excluir Usuário (Admin)
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Lateral: Associações de Empresa */}
        <Card className="lg:col-span-1 border-gray-200">
          <CardHeader><CardTitle className="text-gray-900 flex items-center gap-2"><Building className="h-5 w-5" /> Associações de Empresa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {userDetails.companies.length === 0 ? (
              <p className="text-gray-600 text-sm">O usuário não está associado a nenhuma empresa.</p>
            ) : (
              userDetails.companies.map((company) => (
                <div key={company.company_id} className={`p-3 rounded-lg border ${company.is_primary ? 'border-primary bg-primary/10' : 'border-gray-200 bg-gray-50'}`}>
                  <p className="font-semibold text-gray-900">{company.company_name}</p>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <Badge variant="outline" className="bg-gray-200 text-gray-700">{company.role_type_description}</Badge>
                    {company.is_primary && <Badge className="bg-primary text-primary-foreground">Primária</Badge>}
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-blue-600 text-xs mt-2"
                    onClick={() => navigate(`/admin-dashboard/companies/details/${company.company_id}`)}
                  >
                    Ver Detalhes da Empresa
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserDetailsPage;