export type Plan = "start" | "medium" | "premium";

export interface PlanLimits {
  eventsLimit: number | null; // null = без ограничений (PREMIUM) — лимит на СОЗДАНИЕ встреч
  applicationsLimit: number | null; // null = без ограничений — лимит на УЧАСТИЕ (отклики на чужие встречи)
  boostLimit: number;
  groupMax: number;
  priceRub: number;
  /**
   * Цена в Telegram Stars (XTR). Курс Stars к рублю периодически меняется
   * на стороне Telegram — эти значения ПРИБЛИЗИТЕЛЬНЫЕ и требуют сверки
   * с актуальным курсом перед запуском в продакшн (см. lib/telegram/bot-api.ts).
   */
  priceStars: number;
  rankingCoefficient: number; // используется в lib/scoring/rank-events.ts
}

/**
 * Лимит на участие (отклики) для пользователя БЕЗ какой-либо подписки —
 * единственный лимит во всём приложении, который не завязан на тариф.
 */
export const FREE_APPLICATIONS_LIMIT = 4;

/**
 * Единственное место, где живут лимиты и цены тарифов (п.12, п.26 ТЗ).
 * Меняешь тариф здесь — меняется везде: в paywall, в проверках API, в ranking.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  start: {
    eventsLimit: 3,
    applicationsLimit: 15,
    boostLimit: 1,
    groupMax: 4,
    priceRub: 299,
    priceStars: 150,
    rankingCoefficient: 0,
  },
  medium: {
    eventsLimit: 15,
    applicationsLimit: 30,
    boostLimit: 5,
    groupMax: 10,
    priceRub: 599,
    priceStars: 300,
    rankingCoefficient: 3,
  },
  premium: {
    eventsLimit: null,
    applicationsLimit: null,
    boostLimit: 10,
    groupMax: 30,
    priceRub: 999,
    priceStars: 500,
    rankingCoefficient: 6,
  },
};

export function canCreateMoreEvents(plan: Plan, eventsCreatedInPeriod: number): boolean {
  const limit = PLAN_LIMITS[plan].eventsLimit;
  if (limit === null) return true;
  return eventsCreatedInPeriod < limit;
}

/**
 * plan === null означает пользователя без активной подписки вообще —
 * тогда используется FREE_APPLICATIONS_LIMIT, а не лимит какого-то тарифа.
 */
export function canApplyToMoreEvents(plan: Plan | null, applicationsUsedInPeriod: number): boolean {
  const limit = plan === null ? FREE_APPLICATIONS_LIMIT : PLAN_LIMITS[plan].applicationsLimit;
  if (limit === null) return true;
  return applicationsUsedInPeriod < limit;
}

export function canUseBoost(plan: Plan, boostsUsedInPeriod: number): boolean {
  return boostsUsedInPeriod < PLAN_LIMITS[plan].boostLimit;
}
