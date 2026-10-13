import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueRegistrationTicket } from "@/lib/mobile/auth";
import { verifyAppleIdentityToken } from "@/lib/mobile/apple";
import { attachAppleId } from "@/lib/mobile/otp";
import { mobileSessionPayload } from "@/lib/mobile/session-response";

/**
 * POST /api/auth/mobile/apple  { identityToken, nonce }
 * Вход через Apple в iOS-приложении.
 * → { status: "authenticated", token, user } — Apple ID уже привязан (или совпала подтверждённая почта);
 * → { status: "needs_registration", ticket } — новый человек, дальше анкета и /api/auth/mobile/register.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const identityToken = typeof body?.identityToken === "string" ? body.identityToken : "";
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  if (!identityToken || !nonce) {
    return NextResponse.json({ error: "invalid_input", message: "Не удалось войти через Apple" }, { status: 422 });
  }

  let apple;
  try {
    apple = await verifyAppleIdentityToken(identityToken, nonce);
  } catch (e) {
    console.error("auth/apple keys:", e);
    return NextResponse.json({ error: "apple_unavailable", message: "Apple сейчас не отвечает — попробуй ещё раз" }, { status: 503 });
  }
  if (!apple) {
    return NextResponse.json({ error: "invalid_apple_login", message: "Не удалось подтвердить вход через Apple" }, { status: 401 });
  }

  const admin = createAdminClient();
  let { data: user } = await admin
    .from("users")
    .select("id, telegram_id, moderation_status")
    .eq("apple_sub", apple.sub)
    .maybeSingle();

  // Первый вход через Apple, но почта (подтверждённая Apple) уже есть в профиле — это тот же человек.
  const email = apple.email && apple.emailVerified && !apple.privateEmail ? apple.email : null;
  if (!user && email) {
    const { data: byEmail } = await admin
      .from("users")
      .select("id, telegram_id, moderation_status")
      .eq("email", email)
      .maybeSingle();
    if (byEmail && byEmail.moderation_status !== "banned") {
      const linked = await attachAppleId(admin, byEmail.id, apple.sub);
      if (linked.ok) user = byEmail;
    } else if (byEmail) {
      user = byEmail;
    }
  }

  if (!user) {
    return NextResponse.json({
      status: "needs_registration",
      ticket: issueRegistrationTicket({ kind: "apple", sub: apple.sub, email: apple.emailVerified ? apple.email : null }),
    });
  }
  if (user.moderation_status === "banned") {
    return NextResponse.json({ error: "user_banned" }, { status: 403 });
  }
  return NextResponse.json(await mobileSessionPayload(admin, user));
}
