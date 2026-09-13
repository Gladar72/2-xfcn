/**
 * Ranking ленты "Сегодня рядом".
 *
 * Принцип из ТЗ (п.19): НЕ "PREMIUM всегда первый". Скоринг — взвешенная
 * сумма факторов, где тариф даёт лишь небольшой/умеренный бонус, который
 * релевантная бесплатная/START-встреча в состоянии перебить.
 *
 * Веса вынесены в константы, чтобы их можно было подбирать по реальным
 * данным после запуска, не трогая саму формулу.
 */

export type SubscriptionPlan = "start" | "medium" | "premium" | null;

export interface EventForScoring {
  id: string;
  createdAt: string; // ISO
  eventDate: string; // YYYY-MM-DD
  eventTime: string; // HH:MM:SS
  seatsTotal: number;
  seatsTaken: number;
  boostedAt: string | null; // ISO
  organizerPlan: SubscriptionPlan;
  categorySlug: string;
  trainingTypeSlug: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface RankingContext {
  now: Date;
  viewerLatitude?: number | null;
  viewerLongitude?: number | null;
  /** slugs категорий/типов тренировок, которые нравятся зрителю (из его интересов) */
  viewerInterestSlugs?: string[];
}

const WEIGHTS = {
  freshness: 8, // насколько недавно создана встреча
  proximityInTime: 14, // насколько скоро состоится (в разумных пределах)
  fillRate: 8, // заполненность мест (соц. доказательство, но не переполнено)
  boost: 18, // поднятие организатором
  distance: 14, // географическая близость
  interestMatch: 10, // совпадение с интересами зрителя
  planCoefficient: {
    start: 0,
    medium: 3,
    premium: 6,
  } satisfies Record<Exclude<SubscriptionPlan, null>, number>,
} as const;

const FRESHNESS_HALF_LIFE_HOURS = 36;
const BOOST_WINDOW_HOURS = 48;
const MAX_RELEVANT_DISTANCE_KM = 25;
const MAX_RELEVANT_TIME_HORIZON_DAYS = 14;

export function scoreEvent(event: EventForScoring, ctx: RankingContext): number {
  let score = 0;

  score += WEIGHTS.freshness * exponentialDecay(hoursSince(event.createdAt, ctx.now), FRESHNESS_HALF_LIFE_HOURS);

  const eventDateTime = new Date(`${event.eventDate}T${event.eventTime}`);
  const hoursUntilEvent = (eventDateTime.getTime() - ctx.now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilEvent >= 0) {
    const daysUntil = hoursUntilEvent / 24;
    // Пик релевантности — "скоро, но не прямо сейчас": сегодня/завтра лучше, чем через 2 недели.
    const proximity = Math.max(0, 1 - daysUntil / MAX_RELEVANT_TIME_HORIZON_DAYS);
    score += WEIGHTS.proximityInTime * proximity;
  }

  const fillRatio = event.seatsTotal > 0 ? event.seatsTaken / event.seatsTotal : 0;
  // Идеальная заполненность — около 40-70%: видно, что встреча живая, но ещё есть место.
  const fillScore = 1 - Math.abs(fillRatio - 0.55) / 0.55;
  score += WEIGHTS.fillRate * Math.max(0, fillScore);

  if (event.boostedAt) {
    const hoursSinceBoost = hoursSince(event.boostedAt, ctx.now);
    if (hoursSinceBoost <= BOOST_WINDOW_HOURS) {
      score += WEIGHTS.boost * exponentialDecay(hoursSinceBoost, BOOST_WINDOW_HOURS / 2);
    }
  }

  if (
    ctx.viewerLatitude != null &&
    ctx.viewerLongitude != null &&
    event.latitude != null &&
    event.longitude != null
  ) {
    const distanceKm = haversineDistanceKm(
      ctx.viewerLatitude,
      ctx.viewerLongitude,
      event.latitude,
      event.longitude
    );
    const proximity = Math.max(0, 1 - distanceKm / MAX_RELEVANT_DISTANCE_KM);
    score += WEIGHTS.distance * proximity;
  }

  if (ctx.viewerInterestSlugs?.length) {
    const matches =
      ctx.viewerInterestSlugs.includes(event.categorySlug) ||
      (event.trainingTypeSlug != null && ctx.viewerInterestSlugs.includes(event.trainingTypeSlug));
    if (matches) score += WEIGHTS.interestMatch;
  }

  if (event.organizerPlan) {
    score += WEIGHTS.planCoefficient[event.organizerPlan];
  }

  return score;
}

export function rankEvents<T extends EventForScoring>(events: T[], ctx: RankingContext): T[] {
  return [...events].sort((a, b) => scoreEvent(b, ctx) - scoreEvent(a, ctx));
}

function hoursSince(isoDate: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(isoDate).getTime()) / (1000 * 60 * 60));
}

function exponentialDecay(elapsedHours: number, halfLifeHours: number): number {
  return Math.pow(0.5, elapsedHours / halfLifeHours);
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
