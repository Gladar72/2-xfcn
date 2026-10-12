import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

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
  source: string;
  sourceUrl: string;
}

export const CITY_EVENT_COLS =
  "id, city, title, event_date, event_time, end_date, place_name, address, latitude, longitude, price_text, category, kind, description, source, source_url";

export function mapCityEvent(r: Record<string, unknown>): CityEvent {
  return {
    id: r.id as string,
    city: r.city as string,
    title: r.title as string,
    eventDate: r.event_date as string,
    eventTime: (r.event_time as string | null) ?? null,
    endDate: (r.end_date as string | null) ?? null,
    placeName: (r.place_name as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    latitude: (r.latitude as number | null) ?? null,
    longitude: (r.longitude as number | null) ?? null,
    priceText: (r.price_text as string | null) ?? null,
    category: (r.category as string) ?? "custom",
    kind: (r.kind as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    source: r.source as string,
    sourceUrl: r.source_url as string,
  };
}

/** Одобренные события города на ближайшие 3 недели (идущие выставки — тоже). */
export async function upcomingCityEvents(admin: Admin, city: string, limit = 20): Promise<CityEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
  const { data } = await admin
    .from("city_events")
    .select(CITY_EVENT_COLS)
    .eq("city", city)
    .eq("status", "approved")
    .lte("event_date", until)
    .or(`event_date.gte.${today},end_date.gte.${today}`)
    .order("event_date", { ascending: true })
    .limit(limit);
  return (data ?? []).map(mapCityEvent);
}

/** 3D-иконка для типа события города (обложка вместо чужих постеров). */
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
  return `/brand/cat3d/${KIND_ICON[kind ?? ""] ?? "i_world"}.webp`;
}

/** Подписи типов для карточки. */
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
