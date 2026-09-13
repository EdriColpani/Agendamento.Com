-- Plano Arena Full: somente Torneio (remove WhatsApp dos planos court).
-- Re-sincroniza flags das empresas em planos arena.

-- 1) Remover menu WhatsApp de todos os planos arena (court)
DELETE FROM public.menu_plans mp
USING public.subscription_plans sp, public.menus m
WHERE mp.plan_id = sp.id
  AND mp.menu_id = m.id
  AND m.menu_key = 'mensagens-whatsapp'
  AND sp.target_scheduling_mode = 'court';

-- 2) Remover feature WhatsApp de todos os planos arena (court)
DELETE FROM public.plan_features pf
USING public.subscription_plans sp, public.features f
WHERE pf.plan_id = sp.id
  AND pf.feature_id = f.id
  AND sp.target_scheduling_mode = 'court'
  AND (
    f.slug IN ('whatsapp-messaging', 'whatsapp_messaging', 'whatsapp')
    OR f.company_flag_name = 'whatsapp_messaging_enabled'
  );

-- 3) Torneio: somente no Plano Arena Full (court + nome contém "full")
-- Remove slug duplicado "torneio" se existir (canonical: tournament)
DELETE FROM public.plan_features pf
USING public.subscription_plans sp, public.features f
WHERE pf.plan_id = sp.id
  AND pf.feature_id = f.id
  AND sp.target_scheduling_mode = 'court'
  AND lower(sp.name) LIKE '%full%'
  AND f.slug = 'torneio';

INSERT INTO public.plan_features (plan_id, feature_id, feature_limit)
SELECT sp.id, f.id, NULL::integer
FROM public.subscription_plans sp
CROSS JOIN public.features f
WHERE sp.target_scheduling_mode = 'court'
  AND sp.status = 'active'
  AND lower(sp.name) LIKE '%full%'
  AND f.slug = 'tournament'
  AND NOT EXISTS (
    SELECT 1
    FROM public.plan_features pf
    WHERE pf.plan_id = sp.id AND pf.feature_id = f.id
  );

-- Remove torneio de planos arena que NÃO são Full
DELETE FROM public.plan_features pf
USING public.subscription_plans sp, public.features f
WHERE pf.plan_id = sp.id
  AND pf.feature_id = f.id
  AND sp.target_scheduling_mode = 'court'
  AND lower(sp.name) NOT LIKE '%full%'
  AND f.slug = 'tournament';

-- 4) Menu Torneios: somente Plano Arena Full
INSERT INTO public.menu_plans (menu_id, plan_id)
SELECT m.id, sp.id
FROM public.menus m
CROSS JOIN public.subscription_plans sp
WHERE m.menu_key = 'arena-torneios'
  AND m.is_active = true
  AND sp.target_scheduling_mode = 'court'
  AND sp.status = 'active'
  AND lower(sp.name) LIKE '%full%'
ON CONFLICT (menu_id, plan_id) DO NOTHING;

DELETE FROM public.menu_plans mp
USING public.subscription_plans sp, public.menus m
WHERE mp.plan_id = sp.id
  AND mp.menu_id = m.id
  AND m.menu_key = 'arena-torneios'
  AND sp.target_scheduling_mode = 'court'
  AND lower(sp.name) NOT LIKE '%full%';

-- 5) Re-sincronizar flags das empresas com assinatura ativa/trial em planos court
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
