import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ProfileEditModal from '@/components/ProfileEditModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';

const ProfilePage: React.FC = () => {
  const { session, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (session?.user) {
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number, cpf, avatar_url, birth_date, gender')
        .eq('id', session.user.id)
        .single();

      if (error) {
        showError('Erro ao carregar perfil: ' + error.message);
        console.error('Error fetching profile:', error);
        // Optionally redirect if profile doesn't exist or error is severe
        // navigate('/');
      } else if (data) {
        setProfile(data);
      }
      setLoadingProfile(false);
    } else if (!sessionLoading && !session) {
      // If not loading session and no session, redirect to login
      navigate('/login');
    }
  }, [session, sessionLoading, navigate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleProfileUpdated = () => {
    fetchProfile(); // Re-fetch profile data after update
  };

  if (sessionLoading || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-700">Carregando perfil...</p>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Não foi possível carregar os dados do perfil.</p>
      </div>
    );
  }

  const userEmail = session.user.email || 'N/A';
  const userInitials = (profile.first_name ? profile.first_name[0] : '') + (profile.last_name ? profile.last_name[0] : '');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <CardHeader className="text-center">
          <Avatar className="w-24 h-24 mx-auto mb-4">
            <AvatarImage src={profile.avatar_url || ''} alt="User Avatar" />
            <AvatarFallback className="bg-primary text-white text-3xl">
              {userInitials.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white">
            {profile.first_name} {profile.last_name}
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-400">{userEmail}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="first_name_display" className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome</Label>
              <Input id="first_name_display" value={profile.first_name} readOnly className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white" />
            </div>
            <div>
              <Label htmlFor="last_name_display" className="text-sm font-medium text-gray-700 dark:text-gray-300">Sobrenome</Label>
              <Input id="last_name_display" value={profile.last_name} readOnly className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white" />
            </div>
            <div>
              <Label htmlFor="phone_number_display" className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefone</Label>
              <Input id="phone_number_display" value={profile.phone_number ? `(${profile.phone_number.substring(0,2)}) ${profile.phone_number.substring(2,7)}-${profile.phone_number.substring(7)}` : 'N/A'} readOnly className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white" />
            </div>
            <div>
              <Label htmlFor="cpf_display" className="text-sm font-medium text-gray-700 dark:text-gray-300">CPF</Label>
              <Input id="cpf_display" value={profile.cpf ? `${profile.cpf.substring(0,3)}.${profile.cpf.substring(3,6)}.${profile.cpf.substring(6,9)}-${profile.cpf.substring(9)}` : 'N/A'} readOnly className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white" />
            </div>
            <div>
              <Label htmlFor="birth_date_display" className="text-sm font-medium text-gray-700 dark:text-gray-300">Data de Nascimento</Label>
              <Input id="birth_date_display" value={profile.birth_date || 'N/A'} readOnly className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white" />
            </div>
            <div>
              <Label htmlFor="gender_display" className="text-sm font-medium text-gray-700 dark:text-gray-300">Gênero</Label>
              <Input id="gender_display" value={profile.gender || 'N/A'} readOnly className="mt-1 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white" />
            </div>
          </div>
          <Button
            onClick={() => setIsEditModalOpen(true)}
            className="w-full !rounded-button whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90 mt-6"
          >
            <i className="fas fa-edit mr-2"></i>
            Editar Perfil
          </Button>
        </CardContent>
      </Card>

      {session && profile && (
        <ProfileEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          session={session}
          currentProfile={profile}
          onProfileUpdated={handleProfileUpdated}
        />
      )}
    </div>
  );
};

export default ProfilePage;