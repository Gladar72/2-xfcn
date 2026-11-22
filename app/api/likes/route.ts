import { usesTelegramNotifications } from "@/lib/notify/channel";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";
import { notifyTelegram } from "@/lib/telegram/notify";
import { notifyUser } from "@/lib/notify/user";
import { HEARTS_PER_DAY, HINTS_PER_DAY, hasHeart, isBlocked, sentToday } from "@/lib/likes";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * GET /api/likes?userId=… — поставил ли я сердечко этому человеку и взаимно ли.
 * POST /api/likes { userId, kind: "heart" | "hint" } — поставить сердечко / намекнуть «Хочу на встречу».
 * Логика и хранение — lib/likes.ts.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID.test(userId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  const [liked, likedMe, today] = await Promise.all([
    hasHeart(admin, me.userId, userId),
    hasHeart(admin, userId, me.userId),
    sentToday(admin, me.userId, "heart"),
  ]);
  return NextResponse.json({ liked, mutual: liked && likedMe, left: Math.max(0, HEARTS_PER_DAY - today) });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.toLowerCase() : "";
  const kind = body?.kind === "hint" ? "hint" : "heart";
  if (!UUID.test(userId) || userId === me.userId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: target }, { data: self }, blocked] = await Promise.all([
    admin.from("users").select("id, telegram_id, moderation_status").eq("id", userId).maybeSingle(),
    admin.from("users").select("name, gender").eq("id", me.userId).maybeSingle(),
    isBlocked(admin, me.userId, userId),
  ]);
  if (!target || blocked || (target.moderation_status && target.moderation_status !== "active")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const myName = (self?.name as string | null)?.trim() || "Кто-то";
  const she = self?.gender === "female";

  if (kind === "hint") {
    if ((await sentToday(admin, me.userId, "meet_hint")) >= HINTS_PER_DAY) {
      return NextResponse.json({ error: "limit", limit: HINTS_PER_DAY }, { status: 429 });
    }
    const { error } = await admin.from("notifications").insert({ user_id: userId, type: "meet_hint", payload: { fromUserId: me.userId } });
    if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });
    await notifyUser(admin, userId, {
      title: `👋 ${myName} хочет на встречу`,
      body: "Позови куда-нибудь или ответь сердечком",
      url: `/person/${me.userId}`,
      data: { fromUserId: me.userId, type: "meet_hint" },
      telegramId: target.telegram_id,
      telegramText: `👋 ${myName} намекает: хочет с тобой на встречу! Загляни в «Место» — позови ${she ? "её" : "его"} куда-нибудь или ответь сердечком.`,
    });
    return NextResponse.json({ ok: true });
  }

  // Сердечко: повторно не ставим, лимит в сутки.
  if (await hasHeart(admin, me.userId, userId)) {
    return NextResponse.json({ ok: true, already: true, mutual: await hasHeart(admin, userId, me.userId) });
  }
  if ((await sentToday(admin, me.userId, "heart")) >= HEARTS_PER_DAY) {
    return NextResponse.json({ error: "limit", limit: HEARTS_PER_DAY }, { status: 429 });
  }
  // Postgres accepts 32 hex digits for UUIDs. The same directional heart
  // uses the same primary key, including when two requests race the read.
  const heartId = createHash("sha256").update(`mesto:heart:${me.userId}:${userId}`).digest("hex").slice(0, 32);
  const { error } = await admin.from("notifications").insert({
    id: heartId, user_id: userId, type: "heart", payload: { fromUserId: me.userId, profileViewed: false },
  });
  if (error?.code === "23505") {
    return NextResponse.json({ ok: true, already: true, mutual: await hasHeart(admin, userId, me.userId) });
  }
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  const mutual = await hasHeart(admin, userId, me.userId);

  if (mutual) {
    const { data: other } = await admin.from("users").select("name, gender").eq("id", userId).maybeSingle();
    const otherName = (other?.name as string | null)?.trim() || "Этот человек";
    const otherShe = other?.gender === "female";
    await admin.from("notifications").insert([
      { user_id: userId, type: "heart_mutual", payload: { fromUserId: me.userId } },
      { user_id: me.userId, type: "heart_mutual", payload: { fromUserId: userId } },
    ]);
    if (me.telegramId && await usesTelegramNotifications(admin, me.userId)) await notifyTelegram(me.telegramId, `💜 Это взаимно! ${otherName} тоже ${otherShe ? "поставила" : "поставил"} тебе сердечко — самое время позвать на встречу.`);
  }
  // Each incoming heart alerts its recipient once, also when it completes a match.
  await notifyUser(admin, userId, {
    title: mutual ? "💜 Это взаимно!" : `❤️ ${myName} ${she ? "поставила" : "поставил"} сердечко`,
    body: mutual ? `${myName} тоже ${she ? "поставила" : "поставил"} тебе сердечко` : "Ответь или позови на встречу",
    url: `/person/${me.userId}?heart=1`,
    data: { fromUserId: me.userId, type: mutual ? "heart_mutual" : "heart" },
    telegramId: target.telegram_id,
    telegramText: mutual
      ? `💜 Это взаимно! ${myName} ${she ? "ответила" : "ответил"} тебе сердечком — самое время позвать на встречу.`
      : `❤️ ${myName} ${she ? "поставила" : "поставил"} тебе сердечко в «Месте». Загляни в профиль — можно ответить или позвать на встречу.`,
  });
  return NextResponse.json({ ok: true, mutual });
}

/**
 * DELETE /api/likes?userId=… — убрать своё сердечко (нажал случайно), как в других сервисах.
 * Взаимность после этого пропадает; уведомление «Это взаимно» не трогаем.
 */
export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID.test(userId) || userId === me.userId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").delete().eq("user_id", userId).eq("type", "heart").eq("payload->>fromUserId", me.userId);
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
