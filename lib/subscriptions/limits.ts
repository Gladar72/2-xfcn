export type Plan = "start" | "medium" | "premium";

export interface PlanLimits {
  eventsLimit: number | null; // null = без ограничений (PREMIUM)
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
 * Единственное место, где живут лимиты и цены тарифов (п.12, п.26 ТЗ).
 * Меняешь тариф здесь — меняется везде: в paywall, в проверках API, в ranking.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  start: { eventsLimit: 3, boostLimit: 1, groupMax: 4, priceRub: 299, priceStars: 150, rankingCoefficient: 0 },
  medium: { eventsLimit: 15, boostLimit: 5, groupMax: 10, priceRub: 599, priceStars: 300, rankingCoefficient: 3 },
  premium: { eventsLimit: null, boostLimit: 10, groupMax: 30, priceRub: 999, priceStars: 500, rankingCoefficient: 6 },
};

export function canCreateMoreEvents(plan: Plan, eventsCreatedInPeriod: number): boolean {
  const limit = PLAN_LIMITS[plan].eventsLimit;
  if (limit === null) return true;
  return eventsCreatedInPeriod < limit;
}

export function canUseBoost(plan: Plan, boostsUsedInPeriod: number): boolean {
  return boostsUsedInPeriod < PLAN_LIMITS[plan].boostLimit;
}
