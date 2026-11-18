interface AddressEvent { id: string; latitude: number; longitude: number; address?: string | null; organizerHidden?: boolean }
export const ADDRESS_ZOOM = 16;

function addressKey(event: AddressEvent, city: string) {
  const address = event.organizerHidden ? "" : event.address?.toLowerCase().replace(/ё/g, "е")
    .replace(/(?:^|[\s,.])(улица|ул|дом|д)(?=[\s,.]|\d)/gu, " ")
    .replace(/[\s,.]+/gu, " ").trim();
  if (!address || !/\d/u.test(address)) return null;
  const cityName = city.toLowerCase().replace(/ё/g, "е").trim();
  return cityName && address.startsWith(cityName + " ") ? address.slice(cityName.length + 1) : address;
}

/** Сначала закрепляем каждый адрес за одной из сохранённых координат независимо от масштаба. */
export function groupLocations<T extends AddressEvent>(events: T[], city = "") {
  const addressAnchors = new Map<string, T>();
  const locations = new Map<string, { id: string; lng: number; lat: number; items: T[] }>();
  for (const e of [...events].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = addressKey(e, city);
    let anchor = e;
    if (key) {
      // API возвращает события одного города. Закрепляем адрес и при расхождении геокодеров.
      anchor = addressAnchors.get(key) ?? e;
      addressAnchors.set(key, anchor);
    }
    const coord = anchor.longitude + "," + anchor.latitude;
    const location = locations.get(coord);
    if (location) location.items.push(e);
    else locations.set(coord, { id: anchor.id, lng: anchor.longitude, lat: anchor.latitude, items: [e] });
  }
  return [...locations.values()];
}
