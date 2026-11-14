import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTelegramLogin } from "@/lib/mobile/auth";
import { telegramSignIn } from "@/lib/mobile/telegram-signin";

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

  const [payload, status] = await telegramSignIn(createAdminClient(), data, {
    phoneTicket: body?.phoneTicket,
    emailTicket: body?.emailTicket,
  });
  return NextResponse.json(payload, { status });
}
