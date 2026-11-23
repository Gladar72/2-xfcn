export interface Pt { lng: number; lat: number }
interface EventPoint extends Pt { id: string; address?: string | null; organizerHidden?: boolean }
export interface MapGroup<T> extends Pt { id: string; items: T[]; locationCount: number }
export const ADDRESS_ZOOM = 16;
export const MAX_MAP_ZOOM = 20;
export const PHOTO_PIN_LIMIT = 5;

export function markerMode<T>(group: MapGroup<T>, zoom: number) {
  if (group.locationCount > 1) return "zoom";
  if (group.items.length > PHOTO_PIN_LIMIT) return "schedule";
  return group.items.length > 1 && zoom < ADDRESS_ZOOM ? "zoom" : "photos";
}

// All markers keep the address coordinate. Only their on-screen symbols move.
export function photoOffset(count: number, index: number, zoom: number): [number, number] {
  const upper = Math.floor(count / 2);
  const twoRows = count > 2;
  const top = twoRows && index < upper;
  const rowCount = twoRows ? (top ? upper : count - upper) : count;
  const column = twoRows && !top ? index - upper : index;
  const scale = Math.min(1, 2 ** (zoom - 18));
  return [(column - (rowCount - 1) / 2) * 66 * scale, twoRows ? (top ? -37 : 37) * scale : 0];
}


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
  const sorted = [...events].sort((a, b) => a.id.localeCompare(b.id));
  const knownAt = new Map<string, Set<string>>();
  const locations = new Map<string, MapGroup<T>>();
  const keyed = sorted.map(e => {
    const address = addressKey(e, city);
    const coord = e.lng + "," + e.lat;
    if (address) {
      const keys = knownAt.get(coord) ?? new Set<string>();
      keys.add(address);
      knownAt.set(coord, keys);
    }
    return { e, address, coord };
  });
  // Choose a stable, addressed event for the anchor before admitting coordinate-only entries.
  for (const { e, address } of keyed) {
    if (address && !locations.has(address)) locations.set(address, { id: e.id, lng: e.lng, lat: e.lat, items: [], locationCount: 1 });
  }
  for (const { e, address, coord } of keyed) {
    const known = knownAt.get(coord);
    const key = address ?? (!e.organizerHidden && known?.size === 1 ? [...known][0]! : `@${e.organizerHidden ? "private:" : ""}${coord}`);
    const location = locations.get(key);
    if (location) location.items.push(e);
    else locations.set(key, { id: e.id, lng: e.lng, lat: e.lat, items: [e], locationCount: 1 });
  }
  return [...locations.values()];
}

/** Кружок тоже привязан к реальному адресу. Увеличение масштаба разделяет только разные места. */
export function clusterize<T>(locations: MapGroup<T>[], zoom: number, radius = 46): MapGroup<T>[] {
  if (zoom >= ADDRESS_ZOOM) return locations;
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
