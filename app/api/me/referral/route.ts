import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordReferralForUser } from "@/lib/subscriptions/referrals";

/** Ввести код партнёра можно в первые 30 дней после регистрации. */
const WINDOW_DAYS = 30;

const MESSAGES: Record<string, string> = {
  not_found: "Такого кода нет — проверь написание",
  self: "Это твой собственный код",
  already: "Код партнёра уже применён к твоему аккаунту",
  too_late: "Код можно ввести только в первые 30 дней после регистрации",
};

/** POST /api/me/referral { code } — закрепить аккаунт за партнёром (блогером). */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().slice(0, 32) : "";
  if (!/^[a-z0-9]{4,32}$/i.test(code)) return NextResponse.json({ error: "not_found", message: MESSAGES.not_found }, { status: 422 });

  const admin = createAdminClient();
  const { data: user } = await admin.from("users").select("created_at").eq("id", currentUser.userId).maybeSingle();
  if (user?.created_at && Date.now() - new Date(user.created_at as string).getTime() > WINDOW_DAYS * 86400_000) {
    return NextResponse.json({ error: "too_late", message: MESSAGES.too_late }, { status: 422 });
  }
  const result = await recordReferralForUser(admin, currentUser.userId, code);
  if (result !== "ok") return NextResponse.json({ error: result, message: MESSAGES[result] }, { status: 422 });
  return NextResponse.json({ status: "ok" });
}
