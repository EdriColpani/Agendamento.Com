export type PlanSchedulingTarget = 'service' | 'court';

export function normalizePlanSchedulingTarget(
  value: string | null | undefined
): PlanSchedulingTarget {
  return value === 'court' ? 'court' : 'service';
}

/** Plano visível para a empresa conforme segmento (arena vs serviços). */
export function planMatchesCompanySchedulingMode(
  planTarget: string | null | undefined,
  isCourtMode: boolean
): boolean {
  const target = normalizePlanSchedulingTarget(planTarget);
  return isCourtMode ? target === 'court' : target === 'service';
}

export function filterPlansForCompanySchedulingMode<
  T extends { target_scheduling_mode?: string | null },
>(plans: T[], isCourtMode: boolean): T[] {
  return plans.filter((plan) =>
    planMatchesCompanySchedulingMode(plan.target_scheduling_mode, isCourtMode)
  );
}
