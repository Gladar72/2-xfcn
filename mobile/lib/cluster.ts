// Простая кластеризация меток карты (без внешних библиотек): на заданном масштабе
// метки ближе radius пикселей друг к другу собираются в один кружок с числом.
export interface Pt { lng: number; lat: number }
export interface Cluster<T> { id: string; lng: number; lat: number; items: T[]; offset?: [number, number] }
export const ADDRESS_ZOOM = 14;
// До восьми меток остаются в пределах экрана. Более плотные группы открывают список по адресу.
const MAX_FAN = 8;

function px(lng: number, lat: number, z: number): [number, number] {
  const s = 512 * Math.pow(2, z);
  const x = ((lng + 180) / 360) * s;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return [x, y];
}

export function clusterize<T extends Pt & { id: string }>(items: T[], zoom: number, radius = 46): Cluster<T>[] {
  const z = Math.max(0, Math.min(21, zoom));
  const pts = items.map((it) => ({ it, p: px(it.lng, it.lat, z) }));
  const used = new Array(pts.length).fill(false);
  const out: Cluster<T>[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const group = [pts[i]!];
    for (let j = i + 1; j < pts.length; j++) {
      if (used[j]) continue;
      const dx = pts[j]!.p[0] - pts[i]!.p[0];
      const dy = pts[j]!.p[1] - pts[i]!.p[1];
      if (dx * dx + dy * dy <= radius * radius) {
        used[j] = true;
        group.push(pts[j]!);
      }
    }
    const lng = group.reduce((s, g) => s + g.it.lng, 0) / group.length;
    const lat = group.reduce((s, g) => s + g.it.lat, 0) / group.length;
    const members = group.map((g) => g.it);
    if (members.length > 1 && members.length <= MAX_FAN && z >= ADDRESS_ZOOM) {
      const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
      const radiusPx = 44 / Math.sin(Math.PI / ordered.length);
      ordered.forEach((it, index) => {
        const angle = 2 * Math.PI * index / ordered.length;
        out.push({ id: it.id, lng, lat, items: [it], offset: [Math.round(radiusPx * Math.cos(angle)), Math.round(radiusPx * Math.sin(angle))] });
      });
    } else {
      out.push({ id: members.length > 1 ? `group:${members[0]!.id}` : members[0]!.id, lng, lat, items: members });
    }
  }
  return out;
}
