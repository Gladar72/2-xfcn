/** Ответ GET /api/subscriptions (app/api/subscriptions/route.ts). */
export type Plan = "start" | "medium" | "premium";

export interface Subscription {
  active: boolean;
  plan?: Plan;
  periodStart?: string;
  periodEnd?: string;
  events?: { used: number; limit: number | null };
  boosts?: { used: number; limit: number };
}

export const PLAN_NAME: Record<string, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «12 октября» */
export function untilLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Цены для оплаты картой/СБП (ЮKassa) — как в lib/subscriptions/limits.ts на сервере. */
export const PLAN_PRICE_RUB: Record<Plan, number> = { start: 299, medium: 599, premium: 999 };

/** Что даёт тариф — как в веб-версии (components/paywall/Paywall.tsx). */
export const PLAN_FEATURES: Record<Plan, string[]> = {
  start: ["До 3 встреч за период", "Участие до 15 встреч", "1 раз в «Популярное сегодня»", "Группа до 4 человек", "Для бизнеса — группа до 40 человек"],
  medium: [
    "До 15 встреч за период",
    "Участие до 30 встреч",
    "5 раз в «Популярное сегодня»",
    "Выделение встречи и закрытые встречи",
    "Группа до 10 человек",
    "Для бизнеса — группа до 100 человек",
    "Скрытие профиля",
  ],
  premium: [
    "Встречи без ограничений",
    "Участие без ограничений",
    "10 раз в «Популярное сегодня»",
    "Максимальный вес в рекомендациях",
    "Выделение встречи и закрытые встречи",
    "Группа до 30 человек",
    "Для бизнеса — группа без ограничений",
    "Скрытие профиля",
  ],
};
