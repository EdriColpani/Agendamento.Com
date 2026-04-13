-- Menus do módulo arena no catálogo global + menu_plans somente para planos com feature court_booking.
-- Permissões por role continuam em menu_role_permissions (padrão: sem linha = acesso permitido no hook).

INSERT INTO public.menus (menu_key, label, icon, path, display_order, is_active)
VALUES
  ('arena-quadras', 'Quadras', 'fas fa-border-all', '/quadras', 81, true),
  ('arena-horarios', 'Horários', 'fas fa-clock', '/quadras/horarios', 82, true),
  ('arena-agenda', 'Agenda', 'fas fa-th', '/quadras/agenda', 83, true),
  ('arena-reservas', 'Reservas', 'fas fa-list', '/quadras/reservas', 84, true),
  ('arena-precos', 'Preços por horário', 'fas fa-tags', '/quadras/precos', 85, true)
ON CONFLICT (menu_key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  path = EXCLUDED.path,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.menu_plans (menu_id, plan_id)
SELECT m.id, pf.plan_id
FROM public.menus m
CROSS JOIN public.plan_features pf
INNER JOIN public.features f ON f.id = pf.feature_id AND f.slug = 'court_booking'
WHERE m.menu_key IN (
  'arena-quadras',
  'arena-horarios',
  'arena-agenda',
  'arena-reservas',
  'arena-precos'
)
ON CONFLICT (menu_id, plan_id) DO NOTHING;
