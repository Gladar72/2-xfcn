/**
 * Геокодер на OpenStreetMap — бесплатно и без ключей (те же данные, что и у карты MapLibre).
 *   поиск адреса (текст → точки) — Photon (photon.komoot.io), он сделан для подсказок при вводе;
 *   адрес по точке — Nominatim (nominatim.openstreetmap.org).
 * Запасной путь для поиска — Nominatim. Правила Nominatim: не чаще 1 запроса в секунду и понятный User-Agent.
 */
import { CITY_CENTER } from "@/lib/places/osm";

const UA = { "User-Agent": "MestoApp/1.0 (https://mesto-go.ru; t.me/Mesto_people_bot)" };

export type GeoHit = { address: string; latitude: number; longitude: number };

type PhotonProps = {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  district?: string;
  state?: string;
  country?: string;
  countrycode?: string;
};

function join(parts: (string | undefined | null)[]): string {
  const out: string[] = [];
  for (const p of parts) {
    const s = p?.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.join(", ");
}

function photonAddress(p: PhotonProps): string {
  const settlement = p.city || p.town || p.village;
  const street = p.street ? join([p.street, p.housenumber]) : undefined;
  // Название места (кафе, парк) показываем, только если оно не совпадает с улицей/городом.
  const name = p.name && p.name !== p.street && p.name !== settlement ? p.name : undefined;
  return join([settlement || p.state, street, name]);
}

/** Центр города: известные — сразу, остальные — один раз через Nominatim (кэш в памяти). */
const centerCache = new Map<string, Promise<[number, number] | null>>();
async function cityCenter(city: string): Promise<[number, number] | null> {
  const known = CITY_CENTER[city];
  if (known) return known;
  let p = centerCache.get(city);
  if (!p) {
    p = fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ru&accept-language=ru&city=${encodeURIComponent(city)}`,
      { headers: UA, signal: AbortSignal.timeout(4000) }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { lat?: string; lon?: string }[]) => (d[0]?.lat && d[0]?.lon ? ([Number(d[0].lat), Number(d[0].lon)] as [number, number]) : null))
      .catch(() => null);
    centerCache.set(city, p);
  }
  return p;
}

function km(a: [number, number], lat: number, lon: number) {
  const dLat = ((lat - a[0]) * Math.PI) / 180;
  const dLon = ((lon - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/**
 * Поиск адреса по тексту в пределах города (~60 км от центра): «Ямская», «Гагаринский парк».
 * Раньше город просто дописывался в текст запроса — Photon находил «Ямскую» на Камчатке.
 * Теперь: поиск смещён к центру города, всё дальше 60 км отбрасывается, город из текста убираем.
 */
export async function osmSearch(query: string, city?: string | null, limit = 5): Promise<GeoHit[]> {
  const center = city ? await cityCenter(city) : null;
  const q = city ? query.replace(new RegExp(`(^|[\\s,])(г\\.?\\s*)?${city}(?=$|[\\s,])`, "gi"), " ").replace(/\s+/g, " ").trim() || query : query;
  const near = (h: GeoHit) => !center || km(center, h.latitude, h.longitude) <= 60;
  try {
    const bias = center ? `&lat=${center[0]}&lon=${center[1]}&zoom=12&location_bias_scale=0.1` : "";
    const bbox = center ? `&bbox=${center[1] - 1},${center[0] - 0.6},${center[1] + 1},${center[0] + 0.6}` : "";
    // lang=default — местные (русские) названия; без него Photon отдаёт английские.
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit + 5}&lang=default${bias}${bbox}`, {
      headers: UA,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = (await res.json()) as {
        features?: { geometry?: { coordinates?: [number, number] }; properties?: PhotonProps }[];
      };
      const hits = (d.features ?? [])
        .filter((f) => !f.properties?.countrycode || f.properties.countrycode === "RU")
        .map((f) => {
          const c = f.geometry?.coordinates;
          const address = photonAddress(f.properties ?? {});
          if (!c || !address) return null;
          return { address, longitude: c[0], latitude: c[1] };
        })
        .filter((h): h is GeoHit => !!h)
        .filter(near)
        // Несколько зданий с одним адресом — оставляем одно.
        .filter((h, i, all) => all.findIndex((x) => x.address === h.address) === i)
        .slice(0, limit);
      if (hits.length) return hits;
    } else {
      console.error("osmSearch: Photon ответил", res.status);
    }
  } catch (err) {
    console.error("osmSearch: Photon недоступен", err);
  }
  return (await nominatimSearch(q, limit, center)).filter(near);
}

async function nominatimSearch(text: string, limit: number, center: [number, number] | null = null): Promise<GeoHit[]> {
  try {
    const box = center ? `&viewbox=${center[1] - 0.8},${center[0] + 0.5},${center[1] + 0.8},${center[0] - 0.5}&bounded=1` : "";
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&countrycodes=ru&accept-language=ru&addressdetails=1${box}&q=${encodeURIComponent(text)}`,
      { headers: UA, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { lat?: string; lon?: string; address?: Record<string, string>; display_name?: string }[];
    return d
      .map((r) => {
        if (!r.lat || !r.lon) return null;
        const address = (r.address && nominatimAddress(r.address)) || r.display_name || "";
        return address ? { address, latitude: Number(r.lat), longitude: Number(r.lon) } : null;
      })
      .filter((h): h is GeoHit => !!h);
  } catch {
    return [];
  }
}

function nominatimAddress(a: Record<string, string>): string {
  const settlement = a.city || a.town || a.village || a.hamlet;
  const street = a.road || a.pedestrian || a.square;
  const place = a.amenity || a.leisure || a.tourism || a.shop;
  return join([settlement || a.state, street ? join([street, a.house_number]) : undefined, place]);
}

/** Адрес по точке на карте. */
export async function osmReverse(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=ru&lat=${lat}&lon=${lng}`,
      { headers: UA, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      console.error("osmReverse: Nominatim ответил", res.status);
      return null;
    }
    const d = (await res.json()) as { address?: Record<string, string>; display_name?: string };
    return (d.address && nominatimAddress(d.address)) || d.display_name || null;
  } catch {
    return null;
  }
}
