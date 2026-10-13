/** Ответ GET /api/subscriptions (app/api/subscriptions/route.ts). */
export interface Subscription {
  active: boolean;
  plan?: "start" | "medium" | "premium";
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
