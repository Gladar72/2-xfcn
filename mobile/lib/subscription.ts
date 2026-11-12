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
  start: [
    "До 3 своих встреч за период",
    "Участие в 15 встречах",
    "1 раз поднять встречу в топ",
    "Позвать до 5 человек в сутки",
    "Группа до 4 человек, для бизнеса — до 40",
  ],
  medium: [
    "До 15 своих встреч",
    "Участие в 30 встречах",
    "5 раз в топ",
    "Твои встречи выше в ленте",
    "Позвать до 15 человек в сутки",
    "Группа до 10 человек, для бизнеса — до 100",
    "Скрытие профиля",
  ],
  premium: [
    "Встречи и участие без ограничений",
    "10 раз в топ",
    "Максимальный приоритет в ленте",
    "Звать сколько угодно людей",
    "Группа до 30 человек, для бизнеса — без ограничений",
    "Скрытие профиля",
  ],
};
