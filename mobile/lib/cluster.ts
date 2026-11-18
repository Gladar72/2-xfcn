export interface Pt { lng: number; lat: number }
interface EventPoint extends Pt { id: string; address?: string | null; organizerHidden?: boolean }
export interface MapGroup<T> extends Pt { id: string; items: T[]; locationCount: number }
export const ADDRESS_ZOOM = 16;
export const MAX_MAP_ZOOM = 20;

function pixels(point: Pt, scale: number): [number, number] {
  const sin = Math.sin(Math.min(85.051129, Math.max(-85.051129, point.lat)) * Math.PI / 180);
  return [(point.lng + 180) / 360 * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
}

function addressKey(event: EventPoint, city: string) {
  const address = event.organizerHidden ? "" : event.address?.toLowerCase().replace(/ё/g, "е")
    .replace(/(?:^|[\s,.])(улица|ул|дом|д)(?=[\s,.]|\d)/gu, " ")
    .replace(/[\s,.]+/gu, " ").trim();
  if (!address || !/\d/u.test(address)) return null;
  const cityName = city.toLowerCase().replace(/ё/g, "е").trim();
  return cityName && address.startsWith(cityName + " ") ? address.slice(cityName.length + 1) : address;
}

/** Сначала закрепляем каждый адрес за одной из сохранённых координат независимо от масштаба. */
export function groupLocations<T extends EventPoint>(events: T[], city = ""): MapGroup<T>[] {
  const addressAnchors = new Map<string, T>();
  const locations = new Map<string, MapGroup<T>>();
  for (const e of [...events].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = addressKey(e, city);
    let anchor = e;
    if (key) {
      // API возвращает события одного города. Закрепляем адрес и при расхождении геокодеров.
      anchor = addressAnchors.get(key) ?? e;
      addressAnchors.set(key, anchor);
    }
    const coord = anchor.lng + "," + anchor.lat;
    const location = locations.get(coord);
    if (location) location.items.push(e);
    else locations.set(coord, { id: anchor.id, lng: anchor.lng, lat: anchor.lat, items: [e], locationCount: 1 });
  }
  return [...locations.values()];
}

/** Кружок тоже привязан к реальному адресу. Увеличение масштаба разделяет только разные места. */
export function clusterize<T>(locations: MapGroup<T>[], zoom: number, radius = 46): MapGroup<T>[] {
  const scale = 512 * 2 ** Math.max(0, Math.min(MAX_MAP_ZOOM, zoom));
  const clusters: { group: MapGroup<T>; x: number; y: number }[] = [];
  for (const location of locations) {
    const [x, y] = pixels(location, scale);
    const match = clusters.find(c => (c.x - x) ** 2 + (c.y - y) ** 2 <= radius ** 2);
    if (match) {
      match.group.items.push(...location.items);
      match.group.locationCount++;
    } else clusters.push({ group: { ...location, items: [...location.items] }, x, y });
  }
  return clusters.map(c => c.group);
}
