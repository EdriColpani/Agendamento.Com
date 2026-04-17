-- Políticas RLS para permitir operação do backoffice de pacotes mensais.
-- Escopo: Proprietário/Admin da empresa podem gerenciar planos e visualizar pacotes/vínculos.

DROP POLICY IF EXISTS "court_monthly_plans_select_owner_admin" ON public.court_monthly_plans;
CREATE POLICY "court_monthly_plans_select_owner_admin"
ON public.court_monthly_plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_plans.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

DROP POLICY IF EXISTS "court_monthly_plans_insert_owner_admin" ON public.court_monthly_plans;
CREATE POLICY "court_monthly_plans_insert_owner_admin"
ON public.court_monthly_plans
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_plans.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

DROP POLICY IF EXISTS "court_monthly_plans_update_owner_admin" ON public.court_monthly_plans;
CREATE POLICY "court_monthly_plans_update_owner_admin"
ON public.court_monthly_plans
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_plans.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_plans.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

DROP POLICY IF EXISTS "court_monthly_plans_delete_owner_admin" ON public.court_monthly_plans;
CREATE POLICY "court_monthly_plans_delete_owner_admin"
ON public.court_monthly_plans
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_plans.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

DROP POLICY IF EXISTS "court_monthly_packages_select_owner_admin" ON public.court_monthly_packages;
CREATE POLICY "court_monthly_packages_select_owner_admin"
ON public.court_monthly_packages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_packages.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

DROP POLICY IF EXISTS "court_monthly_packages_update_owner_admin" ON public.court_monthly_packages;
CREATE POLICY "court_monthly_packages_update_owner_admin"
ON public.court_monthly_packages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_packages.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE uc.company_id = court_monthly_packages.company_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);

DROP POLICY IF EXISTS "court_monthly_package_appts_select_owner_admin" ON public.court_monthly_package_appointments;
CREATE POLICY "court_monthly_package_appts_select_owner_admin"
ON public.court_monthly_package_appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.court_monthly_packages pkg
    JOIN public.user_companies uc ON uc.company_id = pkg.company_id
    JOIN public.role_types rt ON rt.id = uc.role_type
    WHERE pkg.id = court_monthly_package_appointments.package_id
      AND uc.user_id = auth.uid()
      AND rt.description IN ('Proprietário', 'Admin')
  )
);
