import { api } from "./api";

/** GET /api/reviews/reviewable — кого ещё не оценил после завершённых встреч. */
export interface ReviewableEvent {
  eventId: string;
  title: string;
  eventDate: string;
  reviewableMembers: { id: string; name: string; avatar_url: string | null }[];
}

export interface ReviewTarget {
  eventId: string;
  eventTitle: string;
  person: { id: string; name: string; avatarUrl: string | null };
}

export async function fetchReviewable(): Promise<ReviewableEvent[]> {
  const r = await api<{ events: ReviewableEvent[] }>("/api/reviews/reviewable");
  return r.events ?? [];
}

/** Плоская очередь «встреча × человек» — по ней идут шторки оценки. */
export function toTargets(events: ReviewableEvent[]): ReviewTarget[] {
  return events.flatMap((e) =>
    e.reviewableMembers.map((m) => ({ eventId: e.eventId, eventTitle: e.title, person: { id: m.id, name: m.name, avatarUrl: m.avatar_url } }))
  );
}

export interface ReviewInput {
  rating: number;
  arrivedOnTime: boolean;
  pleasantCommunication: boolean;
  meetingHappened: boolean;
  wouldMeetAgain: boolean;
}

/** Кого уже оценили за этот запуск — чтобы шторки не спрашивали второй раз. */
const reviewed = new Set<string>();
export const reviewKey = (t: ReviewTarget) => `${t.eventId}:${t.person.id}`;
export function isReviewed(t: ReviewTarget): boolean {
  return reviewed.has(reviewKey(t));
}

/** POST /api/reviews. Повторная оценка (already_reviewed) считается успехом. */
export async function sendReview(t: ReviewTarget, input: ReviewInput): Promise<void> {
  try {
    await api("/api/reviews", { body: { eventId: t.eventId, revieweeId: t.person.id, ...input } });
  } catch (e) {
    if ((e as { code?: string }).code !== "already_reviewed") throw e;
  }
  reviewed.add(reviewKey(t));
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
/** «17 октября» из YYYY-MM-DD. */
export function longDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}
