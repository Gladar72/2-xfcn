import type { createAdminClient } from "@/lib/supabase/admin";
import { osmSearch } from "@/lib/maps/osm-geocode";

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
  photoUrl: string | null;
}

export const CITY_EVENT_COLS =
  "id, city, title, event_date, event_time, end_date, place_name, address, latitude, longitude, price_text, category, kind, description, source, source_url, photo_url";

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
    photoUrl: (r.photo_url as string | null) ?? null,
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

/**
 * Перекладывает обложки (cover_src — афиша события с сайта-источника или
 * нарисованная Мосей) в наше хранилище и записывает photo_url.
 * cover_src заполняет только админ, поэтому адрес — любой https.
 */
export async function syncCityCovers(admin: Admin, limit = 20): Promise<number> {
  const { data } = await admin.from("city_events").select("id, cover_src").not("cover_src", "is", null).is("photo_url", null).limit(limit);
  let done = 0;
  for (const r of data ?? []) {
    try {
      const url = new URL(r.cover_src as string);
      if (url.protocol !== "https:") continue;
      // Сайты афиш часто не отдают картинки серверам — тогда показываем
      // афишу напрямую с сайта (в браузере телефона она открывается).
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!res || !res.ok) {
        await admin.from("city_events").update({ photo_url: url.href }).eq("id", r.id);
        continue;
      }
      const type = res.headers.get("content-type") ?? "image/png";
      if (!type.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > 8 * 1024 * 1024) continue;
      const ext = type.includes("webp") ? "webp" : type.includes("jpeg") ? "jpg" : "png";
      const path = `city/${r.id as string}.${ext}`;
      const { error } = await admin.storage.from("event-photos").upload(path, buf, { contentType: type, upsert: true });
      if (error) continue;
      const { data: pub } = admin.storage.from("event-photos").getPublicUrl(path);
      await admin.from("city_events").update({ photo_url: pub.publicUrl }).eq("id", r.id);
      done++;
    } catch (err) {
      console.error("city cover sync failed:", err);
    }
  }
  return done;
}

/**
 * Координаты для карты заведений: геокодер OpenStreetMap по адресу или названию
 * площадки. Каждое событие пробуем один раз (geo_tried_at).
 */
export async function geocodeCityEvents(admin: Admin, limit = 20): Promise<void> {
  const { data } = await admin
    .from("city_events")
    .select("id, city, place_name, address")
    .is("latitude", null)
    .is("geo_tried_at", null)
    .neq("status", "rejected")
    .order("status", { ascending: true }) // approved раньше pending
    .limit(limit);
  for (const r of data ?? []) {
    const q = (r.address as string | null) ?? (r.place_name as string | null);
    let lat: number | null = null;
    let lon: number | null = null;
    if (q) {
      const hit = (await osmSearch(q, r.city as string | null, 1))[0];
      if (hit) {
        lat = hit.latitude;
        lon = hit.longitude;
      }
    }
    await admin.from("city_events").update({ latitude: lat, longitude: lon, geo_tried_at: new Date().toISOString() }).eq("id", r.id);
  }
}
