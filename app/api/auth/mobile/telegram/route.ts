import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueRegistrationTicket, verifyRegistrationTicket, verifyTelegramLogin } from "@/lib/mobile/auth";
import { attachPhone } from "@/lib/mobile/otp";
import { mobileSessionPayload } from "@/lib/mobile/session-response";

/**
 * POST /api/auth/mobile/telegram  { authData }  — данные Telegram Login Widget
 * (страница /auth/telegram-mobile передаёт их в приложение через ссылку mesto://auth).
 * Аккаунт тот же, что в мини-приложении: ищем по telegram_id.
 *
 * phoneTicket (необязательно) — «пропуск» после проверки номера по SMS, когда
 * номер не нашёлся и человек нажал «У меня уже есть профиль в Telegram».
 * Тогда подтверждённый номер привязывается к найденному Telegram-профилю.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const data = body?.authData && typeof body.authData === "object" ? verifyTelegramLogin(body.authData, botToken) : null;
  if (!data) {
    return NextResponse.json({ error: "invalid_telegram_login", message: "Не удалось подтвердить вход через Telegram" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("users")
    .select("id, telegram_id, moderation_status")
    .eq("telegram_id", data.id)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({
      status: "needs_registration",
      ticket: issueRegistrationTicket({ kind: "telegram", telegramId: data.id, username: data.username ?? null }),
      telegramProfile: { firstName: data.first_name ?? null, photoUrl: data.photo_url ?? null },
    });
  }
  if (user.moderation_status === "banned") {
    return NextResponse.json({ error: "user_banned" }, { status: 403 });
  }

  let phoneLinked: string | null = null;
  let phoneError: string | null = null;
  const phoneTicket = typeof body?.phoneTicket === "string" ? verifyRegistrationTicket(body.phoneTicket) : null;
  if (phoneTicket?.kind === "phone") {
    const attached = await attachPhone(admin, user.id, phoneTicket.phone);
    if (attached.ok) phoneLinked = phoneTicket.phone;
    else phoneError = attached.message;
  }

  return NextResponse.json({ ...(await mobileSessionPayload(admin, user)), phoneLinked, phoneError });
}
