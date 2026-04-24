import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Zap, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showOperationError } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UserData {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    first_name?: string;
    last_name?: string;
  };
  type_user: {
    cod: string;
    descr: string;
  } | null;
}

const UserManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Buscar todos os tipos de usuário (sem depender de relacionamento implícito com auth_users)
      const { data: userTypeData, error: typeError } = await supabase
        .from('type_user')
        .select('user_id, cod, descr, created_at')
        .order('created_at', { ascending: false });

      if (typeError) throw typeError;

      if (!userTypeData || userTypeData.length === 0) {
        setUsers([]);
        return;
      }

      const userIds = userTypeData
        .map((item: any) => item.user_id)
        .filter((id: string | null | undefined) => !!id);

      // 2. Buscar dados de auth (email, metadata) via view auth_users ou Edge Function
      let authUsersData: any[] = [];
      let authError: any = null;

      // Tentar primeiro via view auth_users
      const { data: viewData, error: viewError } = await supabase
        .from('auth_users')
        .select('id, email, created_at, raw_user_meta_data')
        .in('id', userIds);

      if (viewError) {
        // Se a view não existe, usar Edge Function como fallback
        console.warn('[UserManagementPage] View auth_users não disponível, usando Edge Function:', viewError.message);
        
        const { data: functionResponse, error: functionError } = await supabase.functions.invoke('get-user-auth-data', {
          body: { user_ids: userIds },
        });

        if (functionError) {
          authError = functionError;
        } else if (functionResponse?.data) {
          authUsersData = functionResponse.data;
        }
      } else {
        authUsersData = viewData || [];
      }

      if (authError) {
        console.warn('[UserManagementPage] Erro ao buscar dados de auth (continuando sem email):', authError);
        // Não lança erro, apenas continua sem dados de auth
      }

      // 3. Buscar todos os perfis separadamente
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name');

      if (profilesError) throw profilesError;

      const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
      const authMap = new Map((authUsersData || []).map((u: any) => [u.id, u]));

      // 4. Combinar dados
      const processedUsers: UserData[] = userTypeData.map((item: any) => {
        const authUser = authMap.get(item.user_id) || {};
        const profile = profileMap.get(item.user_id) || {};

        return {
          id: item.user_id,
          email: authUser.email || 'N/A',
          created_at: authUser.created_at || item.created_at || 'N/A',
          user_metadata: {
            // Prioriza dados do perfil, depois metadata do auth
            first_name: profile.first_name || authUser.raw_user_meta_data?.first_name,
            last_name: profile.last_name || authUser.raw_user_meta_data?.last_name,
          },
          type_user: {
            cod: item.cod,
            descr: item.descr,
          },
        };
      });

      setUsers(processedUsers);
    } catch (error: any) {
      console.error('[UserManagementPage] Erro ao carregar usuários:', error);
      showOperationError('Erro ao carregar usuários.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getRoleColor = (cod: string) => {
    switch (cod) {
      case 'GLOBAL_ADMIN': return 'bg-red-600 text-white';
      case 'PROPRIETARIO': return 'bg-primary text-primary-foreground';
      case 'CLIENTE': return 'bg-blue-600 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getUserDisplayName = (user: UserData) => {
    const firstName = user.user_metadata.first_name || '';
    const lastName = user.user_metadata.last_name || '';
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    return user.email;
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
          Voltar para Dashboard
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Usuários</h1>
      </div>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Lista Completa de Usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-700">Carregando usuários...</p>
          ) : users.length === 0 ? (
            <p className="text-gray-600">Nenhum usuário encontrado.</p>
          ) : (
            <ScrollArea className="h-[60vh]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo de Usuário</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          {getUserDisplayName(user)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          {user.email}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <Badge className={getRoleColor(user.type_user?.cod || 'N/A')}>
                            {user.type_user?.descr || 'N/A'}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Button
                            variant="outline"
                            size="sm"
                            className="!rounded-button whitespace-nowrap"
                            onClick={() => navigate(`/admin-dashboard/users/details/${user.id}`)}
                          >
                            Detalhes
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagementPage;