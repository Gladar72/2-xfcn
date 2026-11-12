import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBlocked } from "@/lib/likes";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Подписка на организатора (человека или заведение).
 * GET    /api/follows?userId=… → { following, followers, events }
 *        events — ближайшие открытые (не анонимные) события организатора для его профиля.
 * POST   /api/follows { userId } — подписаться.
 * DELETE /api/follows { userId } — отписаться.
 * Новые события организатора приходят подписчикам сами (lib/telegram/follow-notify.ts).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID.test(userId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [mine, count, evs] = await Promise.all([
    admin.from("follows").select("organizer_id").eq("follower_id", me.userId).eq("organizer_id", userId).maybeSingle(),
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("organizer_id", userId),
    admin
      .from("events")
      .select("id, title, event_date, event_time, photo_url, is_business, cost_type, business_pricing_type, business_pricing_details")
      .eq("organizer_id", userId)
      .eq("is_anonymous", false)
      .in("status", ["published", "closed"])
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(6),
  ]);
  return NextResponse.json({
    following: !!mine.data,
    followers: count.count ?? 0,
    events: (evs.data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      eventDate: e.event_date,
      eventTime: e.event_time,
      photoUrl: e.photo_url,
      isBusiness: e.is_business,
      costType: e.cost_type,
      businessPricingType: e.business_pricing_type,
      businessPricingDetails: e.business_pricing_details,
    })),
  });
}

async function target(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return typeof body?.userId === "string" ? body.userId : "";
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = await target(req);
  if (!UUID.test(userId) || userId === me.userId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  if (await isBlocked(admin, me.userId, userId)) return NextResponse.json({ error: "blocked" }, { status: 403 });
  const { error, data: added } = await admin
    .from("follows")
    .upsert({ follower_id: me.userId, organizer_id: userId }, { onConflict: "follower_id,organizer_id", ignoreDuplicates: true })
    .select("follower_id");
  if (error) return NextResponse.json({ error: "follow_failed" }, { status: 500 });
  // В колокольчик: «… подписался на тебя». Не чаще раза в сутки от одного человека
  // (чтобы «подписался–отписался–подписался» не засыпало уведомлениями).
  if ((added?.length ?? 0) > 0) {
    const since = new Date(Date.now() - 86400_000).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "new_follower")
      .eq("payload->>fromUserId", me.userId)
      .gte("created_at", since)
      .limit(1);
    if (!recent?.length) {
      await admin.from("notifications").insert({ user_id: userId, type: "new_follower", payload: { fromUserId: me.userId } });
    }
  }
  const { count } = await admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("organizer_id", userId);
  return NextResponse.json({ following: true, followers: count ?? 0 });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = await target(req);
  if (!UUID.test(userId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("follows").delete().eq("follower_id", me.userId).eq("organizer_id", userId);
  const { count } = await admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("organizer_id", userId);
  return NextResponse.json({ following: false, followers: count ?? 0 });
}
