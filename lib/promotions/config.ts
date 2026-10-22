/** «В популярное сегодня»: общие константы для сервера и экранов. */
export const PROMO_PRICE_RUB = 149;
/** Гарантированное время на первом месте «Популярного» у каждого продвижения. */
export const PROMO_TOP_MINUTES = 60;

/** «13:05» в часовом поясе встречи (offset — часы от UTC). */
export function promoClock(iso: string, utcOffsetHours = 5): string {
  const d = new Date(Date.parse(iso) + utcOffsetHours * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
