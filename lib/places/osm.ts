/**
 * Бесплатные подсказки мест из OpenStreetMap (Overpass API) — работают без
 * ключа. Используются, пока не задан YANDEX_PLACES_API_KEY: кофейни для
 * «Кофе», кинотеатры для «Кино», парки для «Прогулки» и т.д. в городе
 * пользователя. Ответы кешируются на сутки, чтобы не упираться в лимиты
 * публичного сервера.
 */
export interface OsmPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "osm";
}

/** Фильтры Overpass по категориям/видам тренировок. */
const TAGS_BY_CATEGORY: Record<string, string[]> = {
  coffee: ['["amenity"="cafe"]'],
  breakfast: ['["amenity"~"^(cafe|restaurant)$"]'],
  dinner: ['["amenity"="restaurant"]'],
  cinema: ['["amenity"="cinema"]'],
  walk: ['["leisure"~"^(park|garden)$"]'],
  training: ['["leisure"~"^(fitness_centre|sports_centre)$"]'],
  active: ['["leisure"~"^(sports_centre|water_park|ice_rink|climbing|bowling_alley)$"]', '["sport"~"^(climbing|bowling|skiing|karting)$"]'],
  party: ['["amenity"~"^(bar|pub|nightclub)$"]'],
};
const TAGS_BY_TRAINING: Record<string, string[]> = {
  running: ['["leisure"~"^(stadium|track)$"]'],
  padel: ['["sport"~"padel"]'],
  gym: ['["leisure"="fitness_centre"]'],
  hyrox: ['["leisure"="fitness_centre"]'],
  football: ['["sport"="soccer"]["leisure"~"^(pitch|stadium|sports_centre)$"]'],
  yoga: ['["sport"="yoga"]', '["leisure"="fitness_centre"]["name"~"[Йй]ог"]'],
};
/** Для поиска по набранному названию — среди «местных» объектов. */
const ANY_PLACE = ['["amenity"~"^(cafe|restaurant|bar|pub|nightclub|cinema|theatre)$"]', '["leisure"]', '["tourism"~"^(museum|attraction|gallery)$"]'];

function esc(s: string) {
  return s.replace(/[\\"]/g, "\\$&").replace(/[.*+?^${}()|[\]]/g, "\\$&");
}

export function buildOverpassQuery(city: string, category: string, trainingType: string, q: string): string | null {
  const nameFilter = q.length >= 2 ? `["name"~"${esc(q)}",i]` : '["name"]';
  const tags = q.length >= 2 ? ANY_PLACE : TAGS_BY_TRAINING[trainingType] ?? TAGS_BY_CATEGORY[category];
  if (!tags) return null;
  const parts = tags.map((t) => `nwr(area.a)${t}${nameFilter};`).join("");
  return `[out:json][timeout:8];area["name"="${esc(city)}"]["place"~"^(city|town)$"]->.a;(${parts});out center tags 60;`;
}

interface OverpassEl {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseOverpass(data: { elements?: OverpassEl[] }): OsmPlace[] {
  const out: OsmPlace[] = [];
  for (const el of data.elements ?? []) {
    const t = el.tags ?? {};
    const name = t.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat == null || lon == null) continue;
    const street = t["addr:street"];
    const address = street ? `${street}${t["addr:housenumber"] ? `, ${t["addr:housenumber"]}` : ""}` : "";
    out.push({ name, address, latitude: lat, longitude: lon, source: "osm" });
  }
  // Сначала места с адресом и сайтом/телефоном — обычно это живые, известные заведения.
  const score = (p: OsmPlace) => (p.address ? 2 : 0);
  return out.sort((a, b) => score(b) - score(a));
}

export async function searchOsm(city: string, category: string, trainingType: string, q: string): Promise<OsmPlace[]> {
  const query = buildOverpassQuery(city, category, trainingType, q);
  if (!query) return [];
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "MestoApp/1.0 (t.me/Mesto_people_bot)" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    return parseOverpass((await res.json()) as { elements?: OverpassEl[] });
  } catch {
    return [];
  }
}
