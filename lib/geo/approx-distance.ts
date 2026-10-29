/**
 * Примерное расстояние между двумя людьми для «Люди рядом».
 * Безопасность: точки уже огрублены до сетки ~500 м (см. /api/me/location),
 * поэтому точнее «в той же клетке» вычислить нельзя; старше 14 дней — не показываем.
 */
const FRESH_MS = 14 * 864e5;

export interface ApproxGeo {
  approx_lat?: number | string | null;
  approx_lon?: number | string | null;
  approx_location_at?: string | null;
  show_distance?: boolean | null;
}

/** Своя свежая огрублённая точка (или null, если её нет / устарела / человек скрыл расстояние). */
export function freshPoint(g: ApproxGeo | null | undefined): { lat: number; lon: number } | null {
  if (!g || g.show_distance === false) return null;
  if (g.approx_lat == null || g.approx_lon == null || !g.approx_location_at) return null;
  if (Date.now() - new Date(g.approx_location_at).getTime() > FRESH_MS) return null;
  const lat = Number(g.approx_lat);
  const lon = Number(g.approx_lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** Расстояние по прямой между двумя точками, в метрах. */
export function pointDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toR(lat2 - lat1) / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(toR(lon2 - lon1) / 2) ** 2;
  return 2 * 6371e3 * Math.asin(Math.sqrt(h));
}

/**
 * Примерное расстояние между людьми в метрах: до 1 км — шагом 100 м, дальше — шагом 100 м до 10 км,
 * потом целыми км. 0 — «в одной клетке сетки», то есть совсем рядом (до ~500 м).
 */
export function approxDistanceM(a: ApproxGeo | null | undefined, b: ApproxGeo | null | undefined): number | null {
  const p = freshPoint(a);
  const q = freshPoint(b);
  if (!p || !q) return null;
  return roundDistanceM(pointDistanceM(p.lat, p.lon, q.lat, q.lon));
}

export function roundDistanceM(m: number): number {
  if (m < 250) return 0;
  if (m < 10_000) return Math.round(m / 100) * 100;
  return Math.round(m / 1000) * 1000;
}

/** Старый формат (целые км, 0 — меньше 1 км) — для карточки человека и старых версий приложения. */
export function approxDistanceKm(a: ApproxGeo | null | undefined, b: ApproxGeo | null | undefined): number | null {
  const m = approxDistanceM(a, b);
  if (m == null) return null;
  return m < 1000 ? 0 : Math.round(m / 1000);
}

/** «меньше 1 км от тебя» / «≈ 3 км от тебя». */
export function distanceLabel(km: number | null | undefined): string | null {
  if (km == null) return null;
  return km === 0 ? "меньше 1 км от тебя" : `≈ ${km} км от тебя`;
}

/** Коротко для карточек: «рядом», «700 м», «1,4 км», «12 км». */
export function distanceShort(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m <= 0) return "рядом";
  if (m < 1000) return `${m}\u00a0м`; // неразрывный пробел: «700 м» не рвётся по строкам
  if (m < 10_000) return `${(m / 1000).toFixed(1).replace(".", ",").replace(",0", "")}\u00a0км`;
  return `${Math.round(m / 1000)}\u00a0км`;
}
