import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashOtp, issueRegistrationTicket, normalizePhone, safeEqualHex } from "@/lib/mobile/auth";
import { mobileSessionPayload } from "@/lib/mobile/session-response";

/**
 * POST /api/auth/mobile/phone/verify  { phone, code }
 * → { status: "authenticated", token, user } — если номер уже привязан к профилю;
 * → { status: "needs_registration", ticket } — новый пользователь, дальше /api/auth/mobile/register.
 */
const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone(body?.phone);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 4) {
    return NextResponse.json({ error: "invalid_input", message: "Введи 4 цифры из SMS" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: otp } = await admin.from("phone_otps").select("*").eq("phone", phone).maybeSingle();
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "code_expired", message: "Код устарел — запроси новый" }, { status: 400 });
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts", message: "Слишком много попыток — запроси новый код" }, { status: 429 });
  }
  if (!safeEqualHex(hashOtp(phone, code), otp.code_hash)) {
    await admin.from("phone_otps").update({ attempts: otp.attempts + 1 }).eq("phone", phone);
    return NextResponse.json({ error: "wrong_code", message: "Неверный код" }, { status: 400 });
  }
  // Код одноразовый.
  await admin.from("phone_otps").update({ expires_at: new Date(0).toISOString() }).eq("phone", phone);

  const { data: user } = await admin
    .from("users")
    .select("id, telegram_id, moderation_status")
    .eq("phone", phone)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ status: "needs_registration", ticket: issueRegistrationTicket({ kind: "phone", phone }) });
  }
  if (user.moderation_status === "banned") {
    return NextResponse.json({ error: "user_banned" }, { status: 403 });
  }
  return NextResponse.json(await mobileSessionPayload(admin, user));
}
