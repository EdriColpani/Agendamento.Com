-- =====================================================
-- SISTEMA DE CONTROLE DE MENUS
-- =====================================================
-- Este sistema permite:
-- 1. Admin Global: Criar menus e vincular a planos
-- 2. Proprietário: Definir quais roles têm acesso a quais menus
-- =====================================================

-- =====================================================
-- 1. TABELA: menus
-- =====================================================
-- Armazena os menus do sistema
-- Gerenciada apenas por Admin Global
CREATE TABLE IF NOT EXISTS public.menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_key TEXT NOT NULL UNIQUE, -- Ex: 'dashboard', 'agendamentos', 'servicos'
  label TEXT NOT NULL, -- Nome exibido: 'Dashboard', 'Agendamentos', 'Serviços'
  icon TEXT NOT NULL, -- Classe do ícone: 'fas fa-chart-line'
  path TEXT NOT NULL, -- Rota: '/dashboard', '/agendamentos/:companyId'
  display_order INTEGER NOT NULL DEFAULT 0, -- Ordem de exibição no menu
  is_active BOOLEAN NOT NULL DEFAULT true, -- Se o menu está ativo
  description TEXT, -- Descrição opcional do menu
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_menus_menu_key ON public.menus(menu_key);
CREATE INDEX IF NOT EXISTS idx_menus_is_active ON public.menus(is_active);
CREATE INDEX IF NOT EXISTS idx_menus_display_order ON public.menus(display_order);

-- =====================================================
-- 2. TABELA: menu_plans
-- =====================================================
-- Relacionamento N:N entre menus e planos
-- Define quais menus estão disponíveis para quais planos
-- Gerenciada apenas por Admin Global
CREATE TABLE IF NOT EXISTS public.menu_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_id UUID NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(menu_id, plan_id) -- Um menu só pode estar vinculado uma vez a um plano
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_menu_plans_menu_id ON public.menu_plans(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_plans_plan_id ON public.menu_plans(plan_id);

-- =====================================================
-- 3. TABELA: menu_role_permissions
-- =====================================================
-- Permissões de menu por role (função)
-- Define quais roles têm acesso a quais menus
-- Gerenciada por Proprietários da empresa
CREATE TABLE IF NOT EXISTS public.menu_role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  menu_id UUID NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  role_type_id INTEGER NOT NULL REFERENCES public.role_types(id) ON DELETE CASCADE,
  has_access BOOLEAN NOT NULL DEFAULT true, -- Se a role tem acesso ao menu
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, menu_id, role_type_id) -- Uma empresa só pode ter uma permissão por menu+role
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_menu_role_permissions_company_id ON public.menu_role_permissions(company_id);
CREATE INDEX IF NOT EXISTS idx_menu_role_permissions_menu_id ON public.menu_role_permissions(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_role_permissions_role_type_id ON public.menu_role_permissions(role_type_id);
CREATE INDEX IF NOT EXISTS idx_menu_role_permissions_has_access ON public.menu_role_permissions(has_access);

-- =====================================================
-- 4. TRIGGERS para updated_at
-- =====================================================

-- Trigger para menus
CREATE OR REPLACE FUNCTION public.set_menus_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menus_updated_at ON public.menus;
CREATE TRIGGER trg_menus_updated_at
BEFORE UPDATE ON public.menus
FOR EACH ROW
EXECUTE FUNCTION public.set_menus_updated_at();

-- Trigger para menu_role_permissions
CREATE OR REPLACE FUNCTION public.set_menu_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_role_permissions_updated_at ON public.menu_role_permissions;
CREATE TRIGGER trg_menu_role_permissions_updated_at
BEFORE UPDATE ON public.menu_role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_menu_role_permissions_updated_at();

-- =====================================================
-- FIM DA CRIAÇÃO DE TABELAS
-- =====================================================

