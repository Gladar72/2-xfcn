import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { getActiveSubscriptionInfo, incrementBoostsUsed } from "@/lib/subscriptions/server";
import { canUseBoost, PLAN_LIMITS } from "@/lib/subscriptions/limits";

/**
 * POST /api/boosts
 * Body: { eventId: string }
 *
 * Поднимает встречу в ленте — обновляет events.boosted_at на "сейчас".
 * lib/scoring/rank-events.ts уже учитывает boosted_at с затуханием по
 * времени (BOOST_WINDOW_HOURS = 48ч), поэтому КАЖДЫЙ новый подъём —
 * своей ли встречи, чужой ли — автоматически оказывается "свежее" и
 * получает больший бонус в ранжировании, чем более ранние подъёмы: не
 * нужна отдельная очередь или счётчик "кто поднял последним", это уже
 * встроено в формулу через recency затухания.
 *
 * Лимит подъёмов в месяц — по тарифу (PLAN_LIMITS.boostLimit), проверяется
 * на сервере, а не только на фронтенде (п.26 ТЗ — фронтенд нельзя обходить).
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (event.status !== "published") {
    return NextResponse.json({ error: "event_not_active" }, { status: 422 });
  }

  const isAdmin = isAdminTelegramId(currentUser.telegramId);
  const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);

  if (!isAdmin) {
    if (!subscriptionInfo) {
      return NextResponse.json({ error: "subscription_required" }, { status: 402 });
    }
    if (!canUseBoost(subscriptionInfo.plan, subscriptionInfo.boostsUsedCount)) {
      return NextResponse.json({ error: "boost_limit_reached" }, { status: 403 });
    }
  }

  const boostedAt = new Date().toISOString();

  const { error: updateError } = await admin.from("events").update({ boosted_at: boostedAt }).eq("id", eventId);
  if (updateError) return NextResponse.json({ error: "boost_failed" }, { status: 500 });

  await admin.from("boosts").insert({ event_id: eventId, user_id: currentUser.userId });

  let boostsUsed = subscriptionInfo?.boostsUsedCount ?? 0;
  const boostsLimit = subscriptionInfo ? PLAN_LIMITS[subscriptionInfo.plan].boostLimit : null;

  if (!isAdmin && subscriptionInfo) {
    await incrementBoostsUsed(admin, subscriptionInfo.subscriptionId, subscriptionInfo.currentPeriodStart);
    boostsUsed += 1;
  }

  return NextResponse.json({ status: "boosted", boostedAt, boostsUsed, boostsLimit });
}
