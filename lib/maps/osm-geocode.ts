/**
 * Геокодер на OpenStreetMap — бесплатно и без ключей (те же данные, что и у карты MapLibre).
 *   поиск адреса (текст → точки) — Photon (photon.komoot.io), он сделан для подсказок при вводе;
 *   адрес по точке — Nominatim (nominatim.openstreetmap.org).
 * Запасной путь для поиска — Nominatim. Правила Nominatim: не чаще 1 запроса в секунду и понятный User-Agent.
 */
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

/** Поиск адреса по тексту. city — добавляем в запрос, чтобы выдача была в нужном городе. */
export async function osmSearch(query: string, city?: string | null, limit = 5): Promise<GeoHit[]> {
  const text = city ? `${city}, ${query}` : query;
  try {
    // lang=default — местные (русские) названия; без него Photon отдаёт английские.
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=${limit + 3}&lang=default`, {
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
  return nominatimSearch(text, limit);
}

async function nominatimSearch(text: string, limit: number): Promise<GeoHit[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&countrycodes=ru&accept-language=ru&addressdetails=1&q=${encodeURIComponent(text)}`,
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
