import jwt from "jsonwebtoken";

/**
 * Мы не используем стандартную Supabase Auth (у нас вход через Telegram,
 * не email/password). Вместо этого backend сам выпускает JWT в формате,
 * который Supabase понимает как "аутентифицированный пользователь":
 * claim "sub" = users.id (наш uuid), "role" = "authenticated".
 *
 * Тогда в RLS-политиках (supabase/migrations/0008_rls.sql) auth.uid()
 * работает как обычно.
 *
 * Токен подписывается SUPABASE_JWT_SECRET — тем же секретом, который
 * указан в Supabase Project Settings → API → JWT Settings.
 */

const SESSION_COOKIE_NAME = "meetup_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней

export interface SessionPayload {
  sub: string; // users.id
  role: "authenticated";
  telegram_id: number;
}

export function issueSessionToken(userId: string, telegramId: number): string {
  const secret = getJwtSecret();
  const payload: SessionPayload = {
    sub: userId,
    role: "authenticated",
    telegram_id: telegramId,
  };
  return jwt.sign(payload, secret, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySessionToken(token: string): SessionPayload | null {
  const secret = getJwtSecret();
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string") return null;
    if (typeof decoded.sub !== "string" || typeof decoded.telegram_id !== "number") {
      return null;
    }
    return decoded as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = {
  name: SESSION_COOKIE_NAME,
  maxAgeSeconds: SESSION_TTL_SECONDS,
};

function getJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("Отсутствует SUPABASE_JWT_SECRET в переменных окружения");
  }
  return secret;
}
