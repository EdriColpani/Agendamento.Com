import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizePlanSchedulingTarget,
  type PlanSchedulingTarget,
} from '@/utils/planSchedulingMode';

export interface LandingPlanMenu {
  id: string;
  menu_key: string;
  label: string;
  icon: string;
  description: string | null;
  display_order: number;
}

export interface LandingPlanWithMenus {
  id: string;
  name: string;
  description: string | null;
  price: number;
  features: string[];
  duration_months: number;
  target_scheduling_mode?: PlanSchedulingTarget | null;
  menus: LandingPlanMenu[];
  limits: { collaborators?: number; services?: number };
}

export function useLandingPlansWithMenus(schedulingMode: PlanSchedulingTarget) {
  const [plansWithMenus, setPlansWithMenus] = useState<LandingPlanWithMenus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchPlans = async () => {
      setLoading(true);
      try {
        const { data: plansData, error: plansError } = await supabase
          .from('subscription_plans')
          .select('id, name, description, price, features, duration_months, target_scheduling_mode')
          .eq('status', 'active')
          .order('price', { ascending: true });

        if (plansError) throw plansError;

        const filteredPlans = (plansData ?? []).filter(
          (plan) =>
            plan &&
            normalizePlanSchedulingTarget(plan.target_scheduling_mode) === schedulingMode,
        );

        const enriched = await Promise.all(
          filteredPlans.map(async (plan) => {
            const { data: menuPlansData } = await supabase
              .from('menu_plans')
              .select('menu_id, menus(id, menu_key, label, icon, description, display_order)')
              .eq('plan_id', plan.id);

            const menus = (menuPlansData ?? [])
              .map((mp: { menus: LandingPlanMenu | null }) => mp.menus)
              .filter((menu): menu is LandingPlanMenu => menu !== null && menu !== undefined)
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

            const { data: planLimitsData } = await supabase
              .from('plan_limits')
              .select('limit_type, limit_value')
              .eq('plan_id', plan.id)
              .in('limit_type', ['collaborators', 'services']);

            const limits: { collaborators?: number; services?: number } = {};
            (planLimitsData ?? []).forEach((limit: { limit_type: string; limit_value: number }) => {
              if (limit.limit_type === 'collaborators') limits.collaborators = limit.limit_value;
              if (limit.limit_type === 'services') limits.services = limit.limit_value;
            });

            return {
              id: plan.id,
              name: plan.name,
              description: plan.description,
              price: plan.price,
              features: plan.features ?? [],
              duration_months: plan.duration_months,
              target_scheduling_mode: normalizePlanSchedulingTarget(plan.target_scheduling_mode),
              menus,
              limits,
            };
          }),
        );

        if (!cancelled) setPlansWithMenus(enriched);
      } catch (error) {
        console.error('[useLandingPlansWithMenus] Erro:', error);
        if (!cancelled) setPlansWithMenus([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPlans();
    return () => {
      cancelled = true;
    };
  }, [schedulingMode]);

  return { plansWithMenus, loading };
}
