import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { sendPushPersonal } from "@/lib/push/expo";
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
  const userId = typeof body?.userId === "string" ? body.userId : "";
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
    await admin.from("notifications").insert({ user_id: userId, type: "meet_hint", payload: { fromUserId: me.userId } });
    void notifyTelegram(
      target.telegram_id as number | null,
      `👋 ${myName} намекает: хочет с тобой на встречу! Загляни в «Место» — позови ${she ? "её" : "его"} куда-нибудь или ответь сердечком.`
    );
    void sendPushPersonal(admin, [
      { userId, message: { title: `👋 ${myName} хочет на встречу`, body: "Позови куда-нибудь или ответь сердечком", data: { url: `/people/${me.userId}`, type: "meet_hint" } } },
    ]).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // Сердечко: повторно не ставим, лимит в сутки.
  if (await hasHeart(admin, me.userId, userId)) {
    return NextResponse.json({ ok: true, already: true, mutual: await hasHeart(admin, userId, me.userId) });
  }
  if ((await sentToday(admin, me.userId, "heart")) >= HEARTS_PER_DAY) {
    return NextResponse.json({ error: "limit", limit: HEARTS_PER_DAY }, { status: 429 });
  }
  await admin.from("notifications").insert({ user_id: userId, type: "heart", payload: { fromUserId: me.userId } });
  const mutual = await hasHeart(admin, userId, me.userId);

  if (mutual) {
    const { data: other } = await admin.from("users").select("name, gender").eq("id", userId).maybeSingle();
    const otherName = (other?.name as string | null)?.trim() || "Этот человек";
    const otherShe = other?.gender === "female";
    await admin.from("notifications").insert([
      { user_id: userId, type: "heart_mutual", payload: { fromUserId: me.userId } },
      { user_id: me.userId, type: "heart_mutual", payload: { fromUserId: userId } },
    ]);
    void notifyTelegram(
      target.telegram_id as number | null,
      `💜 Это взаимно! ${myName} ${she ? "ответила" : "ответил"} тебе сердечком — самое время позвать на встречу.`
    );
    void notifyTelegram(me.telegramId, `💜 Это взаимно! ${otherName} тоже ${otherShe ? "поставила" : "поставил"} тебе сердечко — самое время позвать на встречу.`);
  } else {
    void notifyTelegram(
      target.telegram_id as number | null,
      `❤️ ${myName} ${she ? "поставила" : "поставил"} тебе сердечко в «Месте». Загляни в профиль — можно ответить или позвать на встречу.`
    );
    void sendPushPersonal(admin, [
      { userId, message: { title: `❤️ ${myName} ${she ? "поставила" : "поставил"} сердечко`, body: "Ответь или позови на встречу", data: { url: "/profile", type: "heart" } } },
    ]).catch(() => {});
  }
  return NextResponse.json({ ok: true, mutual });
}
