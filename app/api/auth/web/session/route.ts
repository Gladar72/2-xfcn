import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/telegram/session";
import { getCurrentUser } from "@/lib/telegram/current-user";

/**
 * Вход на сайте mesto-go.ru без Telegram (обычный браузер, iPhone, компьютер).
 *
 * GET  — есть ли уже действующая сессия (cookie).
 * POST { token } — токен из /api/auth/mobile/email/verify или /register
 *        (те же эндпоинты, что у мобильного приложения) кладём в httpOnly cookie.
 * DELETE — выход.
 */
export async function GET() {
  const me = await getCurrentUser();
  return NextResponse.json({ authenticated: !!me });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  const response = NextResponse.json({ status: "authenticated" });
  response.cookies.set(SESSION_COOKIE.name, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE.maxAgeSeconds,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ status: "logged_out" });
  response.cookies.set(SESSION_COOKIE.name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
