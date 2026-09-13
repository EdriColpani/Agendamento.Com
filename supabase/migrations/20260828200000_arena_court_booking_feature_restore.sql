-- Garante feature court_booking em todos os planos arena ativos e re-sincroniza flags.
-- O sync anterior (arena_full_tournament_only) desligou court_booking_enabled
-- porque o Plano Arena Premium não tinha a feature vinculada.

INSERT INTO public.plan_features (plan_id, feature_id, feature_limit)
SELECT sp.id, f.id, NULL::integer
FROM public.subscription_plans sp
CROSS JOIN public.features f
WHERE sp.target_scheduling_mode = 'court'
  AND sp.status = 'active'
  AND f.slug = 'court_booking'
  AND NOT EXISTS (
    SELECT 1
    FROM public.plan_features pf
    WHERE pf.plan_id = sp.id AND pf.feature_id = f.id
  );

-- Garante menus arena nos planos court (idempotente)
INSERT INTO public.menu_plans (menu_id, plan_id)
SELECT m.id, sp.id
FROM public.menus m
CROSS JOIN public.subscription_plans sp
WHERE sp.target_scheduling_mode = 'court'
  AND sp.status = 'active'
  AND m.menu_key IN (
    'arena-quadras',
    'arena-horarios',
    'arena-agenda',
    'arena-reservas',
    'arena-precos'
  )
  AND m.is_active = true
ON CONFLICT (menu_id, plan_id) DO NOTHING;

-- Re-sincroniza flags das empresas arena com assinatura ativa/trial
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT cs.company_id, cs.plan_id
    FROM public.company_subscriptions cs
    INNER JOIN public.subscription_plans sp ON sp.id = cs.plan_id
    WHERE sp.target_scheduling_mode = 'court'
      AND cs.status IN ('active', 'trial')
  LOOP
    PERFORM public.sync_company_flags_from_plan(r.company_id, r.plan_id);
  END LOOP;
END $$;
