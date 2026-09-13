import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/telegram/session";

export interface CurrentUser {
  userId: string;
  telegramId: number;
  sessionJwt: string;
}

/**
 * Достаёт и проверяет сессию из httpOnly cookie. Возвращает null, если
 * пользователь не аутентифицирован или токен истёк/подделан.
 *
 * Использовать в начале каждого защищённого API route:
 *
 *   const user = await getCurrentUser();
 *   if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE.name)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  return {
    userId: payload.sub,
    telegramId: payload.telegram_id,
    sessionJwt: token,
  };
}
