// Простая кластеризация меток карты (без внешних библиотек): на заданном масштабе
// метки ближе radius пикселей друг к другу собираются в один кружок с числом.
export interface Pt { lng: number; lat: number }
export interface Cluster<T> { id: string; lng: number; lat: number; items: T[] }

function px(lng: number, lat: number, z: number): [number, number] {
  const s = 256 * Math.pow(2, z);
  const x = ((lng + 180) / 360) * s;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return [x, y];
}

export function clusterize<T extends Pt>(items: T[], zoom: number, radius = 72): Cluster<T>[] {
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
    out.push({ id: group.length > 1 ? `c${i}-${group.length}` : `p${i}`, lng, lat, items: group.map((g) => g.it) });
  }
  return out;
}
