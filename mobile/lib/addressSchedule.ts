import type { MapEvent } from "./types";

function localDateTime(ms: number, offset?: number) {
  const date = new Date(ms);
  const hours = offset ?? -date.getTimezoneOffset() / 60;
  return new Date(ms + hours * 3600000).toISOString();
}

export function addressSchedule<T extends MapEvent>(events: T[], now = Date.now()) {
  const sections = new Map<string, { title: string; data: { event: T; time: string }[] }>();
  for (const event of [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))) {
    const time = Date.parse(event.startsAt);
    if (!Number.isFinite(time)) continue;
    const local = localDateTime(time, event.utcOffset);
    const day = local.slice(0, 10);
    let section = sections.get(day);
    if (!section) {
      const today = localDateTime(now, event.utcOffset).slice(0, 10);
      const delta = (Date.parse(day) - Date.parse(today)) / 86400000;
      const title = delta === 0 ? "Сегодня" : delta === 1 ? "Завтра" : new Date(day).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
      section = { title, data: [] };
      sections.set(day, section);
    }
    section.data.push({ event, time: local.slice(11, 16) });
  }
  return [...sections.values()];
}
