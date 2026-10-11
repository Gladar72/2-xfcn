/**
 * Примерное расстояние между двумя людьми для «Люди рядом».
 * Безопасность: точки уже огрублены до ~500 м, результат — целые км
 * (меньше 1 км — просто «рядом»), старше 14 дней — не показываем.
 */
const FRESH_MS = 14 * 864e5;

export interface ApproxGeo {
  approx_lat?: number | string | null;
  approx_lon?: number | string | null;
  approx_location_at?: string | null;
  show_distance?: boolean | null;
}

export function approxDistanceKm(a: ApproxGeo | null | undefined, b: ApproxGeo | null | undefined): number | null {
  if (!a || !b || a.show_distance === false || b.show_distance === false) return null;
  for (const g of [a, b]) {
    if (g.approx_lat == null || g.approx_lon == null || !g.approx_location_at) return null;
    if (Date.now() - new Date(g.approx_location_at).getTime() > FRESH_MS) return null;
  }
  const toR = (d: number) => (d * Math.PI) / 180;
  const la1 = Number(a.approx_lat);
  const lo1 = Number(a.approx_lon);
  const la2 = Number(b.approx_lat);
  const lo2 = Number(b.approx_lon);
  const h = Math.sin(toR(la2 - la1) / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(toR(lo2 - lo1) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(h));
  return km < 1 ? 0 : Math.round(km);
}

/** «меньше 1 км от тебя» / «≈ 3 км от тебя». */
export function distanceLabel(km: number | null | undefined): string | null {
  if (km == null) return null;
  return km === 0 ? "меньше 1 км от тебя" : `≈ ${km} км от тебя`;
}
