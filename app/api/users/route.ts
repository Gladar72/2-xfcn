import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validate-init-data";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { describeValidationError } from "@/lib/validation/describe-error";
import { issueSessionToken, SESSION_COOKIE } from "@/lib/telegram/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyPendingGifts } from "@/lib/gifts/channel-gift";
import { uploadAvatar } from "@/lib/photos/upload-avatar";

/**
 * POST /api/users
 * Body: { initData: string, profile: OnboardingInput }
 *
 * Регистрация нового пользователя. Принимает initData ЗАНОВО (а не полагается
 * на cookie-сессию), потому что на этом шаге аккаунта/сессии ещё не существует —
 * см. app/api/auth/route.ts, ветку "needs_registration".
 *
 * Ничего из тела запроса не считается доверенным до проверки initData:
 * telegram_id пользователя мы берём ТОЛЬКО из проверенной initData,
 * а не из тела запроса, иначе кто угодно мог бы создать профиль от чужого имени.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.initData !== "string") {
    return NextResponse.json({ error: "missing_init_data" }, { status: 400 });
  }

  const authResult = validateTelegramInitData(body.initData, botToken);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: "invalid_init_data", reason: authResult.reason },
      { status: 401 }
    );
  }

  const parsedProfile = onboardingSchema.safeParse(body.profile);
  if (!parsedProfile.success) {
    const { field, message } = describeValidationError(parsedProfile.error);
    return NextResponse.json(
      { error: "validation_failed", field, message, issues: parsedProfile.error.flatten() },
      { status: 422 }
    );
  }

  const telegramUser = authResult.data.user;
  const profile = parsedProfile.data;
  const admin = createAdminClient();

  // На случай повторного вызова (например, пользователь дважды нажал "Готово")
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("telegram_id", telegramUser.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "already_registered" }, { status: 409 });
  }

  const { data: createdUser, error: insertUserError } = await admin
    .from("users")
    .insert({
      telegram_id: telegramUser.id,
      telegram_username: telegramUser.username ?? null,
      name: profile.name,
      birth_date: profile.birthDate,
      gender: profile.gender,
      terms_accepted_at: new Date().toISOString(),
      city: profile.city,
      bio: profile.bio,
    })
    .select("id")
    .single();

  if (insertUserError || !createdUser) {
    console.error("POST /api/users — не удалось создать профиль:", insertUserError);
    return NextResponse.json(
      { error: "create_failed", message: "Сервер не смог сохранить профиль. Попробуй ещё раз через минуту." },
      { status: 500 }
    );
  }

  const userId = createdUser.id as string;

  // Фото — необязательно на регистрации (можно добавить позже из профиля),
  // но если прислано — грузим в Storage и обновляем avatar_url.
  // Если фото не подошло — профиль всё равно создаём (раньше регистрация
  // обрывалась на полпути: профиль уже был, а входа в приложение — нет),
  // а человеку показываем, что именно не так с фото: добавить другое можно
  // в профиле.
  let photoError: string | null = null;
  if (profile.photoBase64) {
    const uploadResult = await uploadAvatar(admin, userId, profile.photoBase64);
    if (uploadResult.ok) {
      await admin.from("users").update({ avatar_url: uploadResult.publicUrl }).eq("id", userId);
      await admin.from("user_photos").insert({ user_id: userId, url: uploadResult.publicUrl, position: 0 });
    } else {
      photoError = uploadResult.error;
    }
  }

  if (profile.interestIds.length > 0) {
    const rows = profile.interestIds.map((interestId) => ({ user_id: userId, interest_id: interestId }));
    await admin.from("user_interests").insert(rows);
  }

  // Подарок из канала (кнопка «Забрать подписку»), забранный до регистрации, —
  // включаем сразу после создания профиля. Ошибка подарка не мешает регистрации.
  await applyPendingGifts(admin, telegramUser.id, userId).catch((err) =>
    console.error("POST /api/users — не удалось включить подарок:", err)
  );

  const sessionToken = issueSessionToken(userId, telegramUser.id);
  const response = NextResponse.json({ status: "registered", userId, photoError });
  response.cookies.set(SESSION_COOKIE.name, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_COOKIE.maxAgeSeconds,
  });
  return response;
}
