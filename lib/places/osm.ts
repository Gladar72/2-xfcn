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

/** Квадрат поиска вокруг центра города: [юг, запад, север, восток]. */
export type BBox = [number, number, number, number];

/** Известные центры — без лишнего запроса к геокодеру. */
const CITY_CENTER: Record<string, [number, number]> = {
  "Тюмень": [57.153, 65.534],
  "Москва": [55.756, 37.617],
  "Санкт-Петербург": [59.939, 30.316],
  "Екатеринбург": [56.838, 60.597],
};

/** Центр города → квадрат примерно 25×25 км (поиск по квадрату в разы быстрее, чем по границе города). */
export function bboxAround(lat: number, lon: number, km = 12): BBox {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((n) => Math.round(n * 1000) / 1000) as BBox;
}

async function cityBBox(city: string): Promise<BBox | null> {
  const known = CITY_CENTER[city];
  if (known) return bboxAround(known[0], known[1]);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&city=${encodeURIComponent(city)}&country=${encodeURIComponent("Россия")}`,
      { headers: UA, next: { revalidate: 60 * 60 * 24 * 30 }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { lat?: string; lon?: string }[];
    const f = d[0];
    if (!f?.lat || !f.lon) return null;
    return bboxAround(Number(f.lat), Number(f.lon));
  } catch {
    return null;
  }
}

export function buildOverpassQuery(bbox: BBox, category: string, trainingType: string, q: string): string | null {
  const nameFilter = q.length >= 2 ? `["name"~"${esc(q)}",i]` : '["name"]';
  const tags = q.length >= 2 ? ANY_PLACE : TAGS_BY_TRAINING[trainingType] ?? TAGS_BY_CATEGORY[category];
  if (!tags) return null;
  const b = bbox.join(",");
  const parts = tags.map((t) => `nwr${t}${nameFilter}(${b});`).join("");
  return `[out:json][timeout:25];(${parts});out center tags 60;`;
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

const UA = { "User-Agent": "MestoApp/1.0 (t.me/Mesto_people_bot)" };

/** Ключ кеша для категории/вида тренировки (null — нечего кешировать). */
export function placeCacheKey(category: string, trainingType: string): string | null {
  if (TAGS_BY_TRAINING[trainingType]) return `training:${trainingType}`;
  return TAGS_BY_CATEGORY[category] ? category : null;
}

/** Все ключи, которые ночной cron прогревает для каждого города. */
export const WARM_KEYS: { category: string; trainingType: string }[] = [
  ...Object.keys(TAGS_BY_CATEGORY).map((category) => ({ category, trainingType: "" })),
  ...Object.keys(TAGS_BY_TRAINING).map((trainingType) => ({ category: "training", trainingType })),
];

export async function searchOsm(
  city: string,
  category: string,
  trainingType: string,
  q: string,
  timeoutMs = 7000
): Promise<OsmPlace[]> {
  if (!(q.length >= 2 || TAGS_BY_TRAINING[trainingType] || TAGS_BY_CATEGORY[category])) return [];
  const bbox = await cityBBox(city);
  if (!bbox) return [];
  const query = buildOverpassQuery(bbox, category, trainingType, q);
  if (!query) return [];
  try {
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      headers: UA,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    return parseOverpass((await res.json()) as { elements?: OverpassEl[] });
  } catch {
    return [];
  }
}
