"use client";

import React, { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import SignupForm from '@/components/SignupForm';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';
import ResetPasswordForm from '@/components/ResetPasswordForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const AuthPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Removendo o estado isResettingPassword daqui, será gerenciado pelo ResetPasswordForm

  console.log('AuthPage - Render - window.location.href:', window.location.href);
  console.log('AuthPage - Render - window.location.hash:', window.location.hash);
  console.log('AuthPage - Render - window.location.search:', window.location.search);

  // O título da página agora depende apenas do pathname
  const pageTitle = location.pathname === '/signup'
    ? 'Cadastre-se no TipoAgenda'
    : location.pathname === '/reset-password'
      ? 'Redefinir Senha'
      : location.pathname === '/forgot-password'
        ? 'Esqueci minha senha'
        : 'Bem-vindo ao TipoAgenda';

  const renderAuthForm = () => {
    if (location.pathname === '/signup') {
      return <SignupForm />;
    }
    if (location.pathname === '/reset-password') {
      return <ResetPasswordForm />;
    }
    if (location.pathname === '/forgot-password') {
      return <ForgotPasswordForm />;
    }
    return <LoginForm />;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <CardHeader className="relative flex flex-row items-center justify-center">
          <div className="flex flex-col items-center w-full">
            <Link to="/" className="flex items-center gap-3 cursor-pointer mb-4">
              <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
                <i className="fas fa-calendar-alt text-white"></i>
              </div>
              <CardTitle
                className="text-3xl font-bold text-center text-gray-900 dark:text-white"
              >
                TipoAgenda
              </CardTitle>
            </Link>
            {/* Título da página baseado na rota */}
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mt-2">
              {pageTitle}
            </h2>
          </div>
        </CardHeader>
        <CardContent>
          {renderAuthForm()}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;