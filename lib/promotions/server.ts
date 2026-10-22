import type { SupabaseClient } from "@supabase/supabase-js";
import { eventTiming } from "@/lib/events/timing";
import { PROMO_TOP_MINUTES } from "@/lib/promotions/config";

/**
 * «В популярное сегодня» (вариант В, согласовано 22.10):
 * - продвинутая встреча встаёт первой в «Популярном» своего города;
 * - у каждого продвижения — гарантированный час на первом месте: если кто-то
 *   продвинул свою встречу, пока идёт чужой час, его час начнётся сразу после;
 * - после своего часа встреча остаётся в «Популярном» до начала встречи.
 *
 * Порядок показа: тот, чей час идёт сейчас → ждущие своего часа (по очереди) →
 * отстоявшие свой час (самые свежие выше). Потом обычные встречи.
 */

export interface PromotionRow {
  id: string;
  event_id: string;
  user_id: string;
  city: string;
  source: string;
  top_from: string;
  top_until: string;
  ends_at: string;
  views: number;
  opens: number;
  created_at: string;
}

const COLS = "id, event_id, user_id, city, source, top_from, top_until, ends_at, views, opens, created_at";

export async function activePromotions(admin: SupabaseClient, city: string, now = new Date()): Promise<PromotionRow[]> {
  const { data } = await admin.from("promotions").select(COLS).eq("city", city).gt("ends_at", now.toISOString());
  return (data ?? []) as PromotionRow[];
}

/** id встреч в порядке показа (у одной встречи может быть несколько продвижений — берём самое выгодное место). */
export function promotedOrder(rows: PromotionRow[], now = new Date()): string[] {
  const t = now.getTime();
  const rank = (r: PromotionRow): [number, number] => {
    const from = Date.parse(r.top_from);
    const until = Date.parse(r.top_until);
    if (from <= t && t < until) return [0, from];
    if (t < from) return [1, from];
    return [2, -Date.parse(r.created_at)];
  };
  const best = new Map<string, [number, number]>();
  for (const r of rows) {
    if (Date.parse(r.ends_at) <= t) continue;
    const k = rank(r);
    const prev = best.get(r.event_id);
    if (!prev || k[0] < prev[0] || (k[0] === prev[0] && k[1] < prev[1])) best.set(r.event_id, k);
  }
  return [...best.entries()].sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).map(([id]) => id);
}

/** Когда начнётся час нового продвижения: сейчас или сразу после последнего занятого часа в городе. */
export function nextTopSlot(rows: PromotionRow[], now = new Date()): Date {
  let t = now.getTime();
  for (const r of rows) {
    if (Date.parse(r.ends_at) <= now.getTime()) continue;
    t = Math.max(t, Date.parse(r.top_until));
  }
  return new Date(t);
}

export interface PromoEvent {
  id: string;
  organizer_id: string;
  status: string;
  city: string | null;
  title: string;
  event_date: string;
  event_time: string;
  event_end_time: string | null;
  longitude: number | null;
}

export async function loadPromoEvent(admin: SupabaseClient, eventId: string): Promise<PromoEvent | null> {
  const { data } = await admin
    .from("events")
    .select("id, organizer_id, status, city, title, event_date, event_time, event_end_time, longitude")
    .eq("id", eventId)
    .maybeSingle();
  return (data as PromoEvent | null) ?? null;
}

/** Можно ли продвигать: опубликована, есть город, ещё не началась и успеет постоять первой. */
export async function promoSlot(admin: SupabaseClient, e: PromoEvent, now = new Date()) {
  if (e.status !== "published" || !e.city) return { ok: false as const, reason: "event_not_active" };
  const start = eventTiming(e).start;
  if (start.getTime() <= now.getTime()) return { ok: false as const, reason: "event_started" };
  const rows = await activePromotions(admin, e.city, now);
  const topFrom = nextTopSlot(rows, now);
  if (topFrom.getTime() >= start.getTime()) return { ok: false as const, reason: "no_slot_before_start", topFrom, endsAt: start };
  const topUntil = new Date(Math.min(topFrom.getTime() + PROMO_TOP_MINUTES * 60_000, start.getTime()));
  return { ok: true as const, topFrom, topUntil, endsAt: start, queueAhead: rows.filter((r) => Date.parse(r.top_until) > now.getTime()).length };
}

/** Создаёт продвижение (место в очереди считается в момент создания). */
export async function createPromotion(
  admin: SupabaseClient,
  e: PromoEvent,
  userId: string,
  source: "plan" | "paid" | "admin",
  paymentId: string | null = null
): Promise<{ ok: true; row: PromotionRow } | { ok: false; reason: string }> {
  const slot = await promoSlot(admin, e);
  if (!slot.ok) return { ok: false, reason: slot.reason };
  const { data, error } = await admin
    .from("promotions")
    .insert({
      event_id: e.id,
      user_id: userId,
      city: e.city,
      source,
      payment_id: paymentId,
      top_from: slot.topFrom.toISOString(),
      top_until: slot.topUntil.toISOString(),
      ends_at: slot.endsAt.toISOString(),
    })
    .select(COLS)
    .single();
  if (error || !data) return { ok: false, reason: "promote_failed" };
  // Бонус в общей ленте (lib/scoring/rank-events.ts) — как у прежнего «Поднять».
  await admin.from("events").update({ boosted_at: new Date().toISOString() }).eq("id", e.id);
  await admin.from("boosts").insert({ event_id: e.id, user_id: userId });
  return { ok: true, row: data as PromotionRow };
}

/** Активное (или ждущее своего часа) продвижение встречи + счётчики для экрана «Ты в популярном». */
export async function promotionStatus(admin: SupabaseClient, eventId: string, now = new Date()) {
  const { data } = await admin
    .from("promotions")
    .select(COLS)
    .eq("event_id", eventId)
    .gt("ends_at", now.toISOString())
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as PromotionRow[];
  if (!rows.length) return null;
  const first = rows.reduce((a, b) => (Date.parse(a.top_from) <= Date.parse(b.top_from) ? a : b));
  const lastTop = rows.reduce((a, b) => (Date.parse(a.top_until) >= Date.parse(b.top_until) ? a : b));
  const sinceIso = first.top_from;
  const { count } = await admin
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .gte("created_at", sinceIso);
  return {
    topFrom: first.top_from,
    topUntil: lastTop.top_until,
    endsAt: rows[0].ends_at,
    views: rows.reduce((s, r) => s + (r.views ?? 0), 0),
    opens: rows.reduce((s, r) => s + (r.opens ?? 0), 0),
    applications: count ?? 0,
  };
}
