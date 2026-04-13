import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const getStatusColor = (status: string) => {
  const colors: { [key: string]: string } = {
    confirmado: 'bg-green-500',
    pendente: 'bg-yellow-500',
    cancelado: 'bg-red-500',
    concluido: 'bg-blue-500', // Adicionado status concluido
    vip: 'bg-yellow-500 text-black',
    regular: 'bg-blue-500',
    novo: 'bg-green-500',
    ativa: 'bg-green-500',
    pausada: 'bg-gray-500'
  };
  return colors[status] || 'bg-gray-500';
};

export const createButton = (onClick: () => void, icon: string, text: string, variant: 'primary' | 'outline' = 'primary') => (
  <Button
    type="button"
    className={`!rounded-button whitespace-nowrap cursor-pointer ${
      variant === 'primary' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : ''
    }`}
    variant={variant === 'outline' ? 'outline' : undefined}
    onClick={onClick}
  >
    <i className={`${icon} mr-2`}></i>
    {text}
  </Button>
);

export const createCard = (title: string, value: string, change: string, icon: string, colorClass = 'yellow') => (
  <Card className="border-gray-200 hover:shadow-lg transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
          <p className={`text-sm text-${colorClass}-600 mt-1`}>{change}</p>
        </div>
        <div className={`w-12 h-12 bg-${colorClass}-100 rounded-lg flex items-center justify-center`}>
          <i className={`${icon} text-${colorClass}-600 text-xl`}></i>
        </div>
      </div>
    </CardContent>
  </Card>
);

export const createFormField = (label: string, name: string, type = 'text', required = false, options: { value: string; label: string }[] = []) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label} {required && '*'}
    </label>
    {type === 'select' ? (
      <select name={name} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required={required}>
        {options.map((opt, idx) => (
          <option key={idx} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : type === 'textarea' ? (
      <textarea
        name={name}
        maxLength={500}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-24 resize-none"
        placeholder={`Digite ${label.toLowerCase()}...`}
      ></textarea>
    ) : (
      <Input
        type={type}
        name={name}
        className="border-gray-300 text-sm"
        required={required}
        placeholder={type === 'tel' ? '(11) 99999-9999' : type === 'email' ? 'email@example.com' : `Digite ${label.toLowerCase()}`}
      />
    )}
  </div>
);

export const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-line', path: '/dashboard' },
  { id: 'agendamentos', label: 'Agendamentos', icon: 'fas fa-calendar-alt', path: '/agendamentos' },
  { id: 'servicos', label: 'Serviços', icon: 'fas fa-briefcase', path: '/servicos' }, // Ícone alterado para 'briefcase'
  { id: 'clientes', label: 'Clientes', icon: 'fas fa-users', path: '/clientes' },
  { id: 'colaboradores', label: 'Colaboradores', icon: 'fas fa-user-tie', path: '/colaboradores' },
  { id: 'financeiro', label: 'Financeiro', icon: 'fas fa-dollar-sign', path: '/financeiro' },
  { id: 'estoque', label: 'Estoque', icon: 'fas fa-boxes', path: '/estoque' },
  { id: 'relatorios', label: 'Relatórios', icon: 'fas fa-chart-bar', path: '/relatorios' },
  { id: 'fidelidade', label: 'Fidelidade', icon: 'fas fa-gift', path: '/fidelidade' },
  { id: 'mensagens-whatsapp', label: 'Mensagens WhatsApp', icon: 'fas fa-comments', path: '/mensagens-whatsapp', roles: ['Proprietário'] },
  { id: 'planos', label: 'Planos', icon: 'fas fa-gem', path: '/planos' },
  { id: 'config', label: 'Configurações', icon: 'fas fa-cog', path: '/config', roles: ['Proprietário'] },
];

// Removendo mockData e estoque, pois serão substituídos por dados reais
export const mockData = {
  kpis: [],
  agendamentos: [],
  clientes: [],
  colaboradores: []
};

export const estoque = [];