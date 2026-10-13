import { API_URL } from "./config";

/** Событие городской афиши (GET /api/city-events, lib/city-events.ts на сервере). */
export interface CityEvent {
  id: string;
  city: string;
  title: string;
  eventDate: string;
  eventTime: string | null;
  endDate: string | null;
  placeName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  priceText: string | null;
  category: string;
  kind: string | null;
  description: string | null;
  source: string | null;
  sourceUrl: string;
  photoUrl: string | null;
}

export const KIND_LABEL: Record<string, string> = {
  concert: "Концерт",
  standup: "Стендап",
  theatre: "Спектакль",
  ballet: "Балет",
  exhibition: "Выставка",
  quiz: "Квиз",
  party: "Вечеринка",
  festival: "Фестиваль",
  sport: "Спорт",
  excursion: "Экскурсия",
  fashion: "Мода",
  workshop: "Мастер-класс",
  kids: "Для детей",
  karaoke: "Караоке",
};

const KIND_ICON: Record<string, string> = {
  concert: "i_concert",
  standup: "i_theatre",
  theatre: "i_theatre",
  ballet: "i_theatre",
  exhibition: "i_art",
  quiz: "i_games",
  party: "i_party",
  festival: "i_music",
  sport: "i_run",
  excursion: "i_world",
  fashion: "i_photo",
  workshop: "i_cook",
  kids: "i_games",
  karaoke: "i_karaoke",
};

export function cityEventIcon(kind: string | null | undefined): string {
  return `${API_URL}/brand/cat3d/${KIND_ICON[kind ?? ""] ?? "i_world"}.webp`;
}

const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d, date: new Date(y, m - 1, d) };
}

/** Идёт несколько дней и уже началось (выставка). */
export function isRunning(c: CityEvent): boolean {
  return !!c.endDate && c.eventDate <= todayIso();
}

/** «17 окт · 19:00» или «идёт · до 25 ноя». */
export function cityWhen(c: CityEvent): string {
  if (isRunning(c) && c.endDate) {
    const e = parts(c.endDate);
    return `идёт · до ${e.d} ${MON[e.m - 1]}`;
  }
  const s = parts(c.eventDate);
  return `${s.d} ${MON[s.m - 1]}${c.eventTime ? ` · ${c.eventTime.slice(0, 5)}` : ""}`;
}

/** Плитки на экране события: «идёт сейчас / до 25 ноября» или «19:00 / суббота, 17 октября». */
export function cityTiles(c: CityEvent): { time: string; day: string } {
  if (isRunning(c) && c.endDate) {
    const e = parts(c.endDate);
    return { time: "идёт сейчас", day: `до ${e.d} ${MONTHS[e.m - 1]}` };
  }
  const s = parts(c.eventDate);
  return {
    time: c.eventTime ? c.eventTime.slice(0, 5) : "время уточняется",
    day: `${WEEKDAYS[s.date.getDay()]}, ${s.d} ${MONTHS[s.m - 1]}`,
  };
}

export function hostOf(c: CityEvent): string {
  const m = /^https?:\/\/(?:www\.)?([^/]+)/i.exec(c.sourceUrl ?? "");
  return m?.[1] ?? c.source ?? "афиша";
}
