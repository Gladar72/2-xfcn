import { CITY_UTC_OFFSET } from "@/lib/data/city-timezones";
import { estimateRussiaUtcOffsetHours } from "@/lib/reviews/timezone";

/** Сколько встреча ещё остаётся открытой после времени окончания (чат, отметки, фото). */
export const COMPLETION_GRACE_MINUTES = 30;

/** Встреча без указанного времени окончания (старые записи) — считаем, что она длится столько. */
const ASSUMED_EVENT_DURATION_HOURS = 4;

export interface EventTimingInput {
  event_date: string;
  event_time: string;
  event_end_time: string | null;
  city?: string | null;
  longitude?: number | null;
}

/**
 * Часовой пояс встречи: сначала по городу (точный список поясов РФ),
 * и только если города нет в списке — грубо по долготе точки.
 *
 * Раньше пояс определялся ТОЛЬКО по долготе, и Тюмень (65° в. д.)
 * попадала в UTC+6 вместо UTC+5 — встреча «заканчивалась» на час
 * раньше, а часовая встреча закрывалась ровно в момент начала.
 */
export function eventUtcOffsetHours(e: Pick<EventTimingInput, "city" | "longitude">): number {
  return (e.city ? CITY_UTC_OFFSET[e.city] : undefined) ?? estimateRussiaUtcOffsetHours(e.longitude);
}

function localToUtc(dateIso: string, timeIso: string, offsetHours: number): Date {
  const time = timeIso.length === 5 ? `${timeIso}:00` : timeIso;
  const naiveAsUtc = new Date(`${dateIso}T${time}Z`);
  return new Date(naiveAsUtc.getTime() - offsetHours * 60 * 60 * 1000);
}

/** Начало, окончание и момент автозавершения встречи (всё в UTC). */
export function eventTiming(e: EventTimingInput): { start: Date; end: Date; autoCompleteAt: Date } {
  const offset = eventUtcOffsetHours(e);
  const start = localToUtc(e.event_date, e.event_time, offset);
  let end: Date;
  if (e.event_end_time) {
    // Окончание раньше начала (22:00–02:00) — значит, на следующий день.
    const endDateIso =
      e.event_end_time < e.event_time
        ? new Date(new Date(`${e.event_date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : e.event_date;
    end = localToUtc(endDateIso, e.event_end_time, offset);
    if (end < start) end = start;
  } else {
    end = new Date(start.getTime() + ASSUMED_EVENT_DURATION_HOURS * 60 * 60 * 1000);
  }
  const autoCompleteAt = new Date(end.getTime() + COMPLETION_GRACE_MINUTES * 60 * 1000);
  return { start, end, autoCompleteAt };
}
