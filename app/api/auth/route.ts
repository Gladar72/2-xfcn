import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validate-init-data";
import { issueSessionToken, SESSION_COOKIE } from "@/lib/telegram/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth
 * Body: { initData: string }
 *
 * 1. Проверяет подпись initData секретом бота (см. lib/telegram/validate-init-data.ts).
 * 2. Находит пользователя по telegram_id или сообщает, что нужна регистрация.
 * 3. Выпускает нашу сессию (httpOnly cookie) с sub = users.id.
 *
 * Ничего из присланного клиентом (id, имя, фото) не считается доверенным,
 * пока подпись не проверена — это прямое требование п.5 и п.38 исходного ТЗ.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const initData = body?.initData;
  if (typeof initData !== "string" || initData.length === 0) {
    return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  }

  const result = validateTelegramInitData(initData, botToken);
  if (!result.ok) {
    return NextResponse.json(
      { error: "invalid_init_data", reason: result.reason },
      { status: 401 }
    );
  }

  const { user: telegramUser } = result.data;
  const admin = createAdminClient();

  const { data: existingUser, error: findError } = await admin
    .from("users")
    .select("id, telegram_id, moderation_status")
    .eq("telegram_id", telegramUser.id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (!existingUser) {
    // Пользователь ещё не завершил регистрацию (см. Этап 4 — Онбординг).
    // Возвращаем признак "нужна регистрация" вместе с непроверенными
    // Telegram-данными для предзаполнения формы (имя, фото) —
    // сами эти поля не дают никаких прав, пока профиль не создан.
    return NextResponse.json({
      status: "needs_registration",
      telegramProfile: {
        telegramId: telegramUser.id,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name ?? null,
        username: telegramUser.username ?? null,
        photoUrl: telegramUser.photo_url ?? null,
      },
    });
  }

  if (existingUser.moderation_status === "banned") {
    return NextResponse.json({ error: "user_banned" }, { status: 403 });
  }

  const sessionToken = issueSessionToken(existingUser.id, telegramUser.id);

  const response = NextResponse.json({ status: "authenticated" });
  response.cookies.set(SESSION_COOKIE.name, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none", // Mini App открывается внутри Telegram WebView (кросс-доменный контекст)
    path: "/",
    maxAge: SESSION_COOKIE.maxAgeSeconds,
  });
  return response;
}
