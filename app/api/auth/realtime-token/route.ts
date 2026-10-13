import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";

/**
 * GET /api/auth/realtime-token
 *
 * Основная сессия хранится в httpOnly cookie — недоступна из браузерного JS
 * специально, чтобы её нельзя было украсть через XSS. Но Supabase Realtime
 * (WebSocket) требует передать JWT явно в клиентский SDK, поэтому даём
 * фронтенду САМ ЖЕ токен через отдельный эндпоинт, только когда он реально
 * нужен — для открытия чата.
 *
 * Токен всё ещё привязан к тому же пользователю и проходит те же RLS-
 * политики, ничего дополнительного он не даёт по сравнению с обычной сессией.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // url и anonKey — публичные (те же NEXT_PUBLIC_*, что видит браузер): мобильному
  // приложению они нужны, чтобы самому подключиться к каналу чата.
  return NextResponse.json({
    token: user.sessionJwt,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
  });
}
