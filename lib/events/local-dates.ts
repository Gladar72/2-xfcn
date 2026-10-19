import { eventUtcOffsetHours } from "@/lib/events/timing";

/**
 * Даты для фильтров «Сегодня / Завтра / На выходных» по времени города, а не сервера (UTC).
 * Иначе в Тюмени с полуночи до 5 утра «сегодня» показывало вчерашний день.
 */
export function cityDates(city: string | null | undefined, now = new Date()) {
  const offset = eventUtcOffsetHours({ city: city ?? null, longitude: null });
  const local = new Date(now.getTime() + offset * 3600_000); // «местное» время в UTC-полях
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (n: number) => new Date(local.getTime() + n * 864e5);
  const dow = local.getUTCDay(); // 0 — воскресенье
  const toSat = dow === 0 ? -1 : 6 - dow;
  const weekend = dow === 0 ? { from: iso(local), to: iso(local) } : { from: iso(plus(toSat)), to: iso(plus(toSat + 1)) };
  return { today: iso(local), tomorrow: iso(plus(1)), weekend };
}
