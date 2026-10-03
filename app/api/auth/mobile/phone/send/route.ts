import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOtp, hashOtp, normalizePhone, sendSmsCode } from "@/lib/mobile/auth";

/**
 * POST /api/auth/mobile/phone/send  { phone }
 * Отправляет 4-значный код по SMS. Не чаще раза в 60 секунд и не больше 5 раз в сутки на номер.
 */
const RESEND_SECONDS = 60;
const MAX_PER_DAY = 5;
const CODE_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone(body?.phone);
  if (!phone) {
    return NextResponse.json({ error: "invalid_phone", message: "Введи номер в формате +7 9XX XXX-XX-XX" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: prev } = await admin.from("phone_otps").select("*").eq("phone", phone).maybeSingle();
  const now = Date.now();

  let sentCount = 1;
  let windowStartedAt = new Date(now).toISOString();
  if (prev) {
    const sinceLast = (now - new Date(prev.last_sent_at).getTime()) / 1000;
    if (sinceLast < RESEND_SECONDS) {
      return NextResponse.json(
        { error: "too_soon", retryAfter: Math.ceil(RESEND_SECONDS - sinceLast), message: "Подожди немного перед повторной отправкой" },
        { status: 429 }
      );
    }
    const windowAge = now - new Date(prev.window_started_at).getTime();
    if (windowAge < 24 * 3600 * 1000) {
      if (prev.sent_count >= MAX_PER_DAY) {
        return NextResponse.json({ error: "too_many", message: "Слишком много попыток. Попробуй завтра" }, { status: 429 });
      }
      sentCount = prev.sent_count + 1;
      windowStartedAt = prev.window_started_at;
    }
  }

  const code = generateOtp();
  const sent = await sendSmsCode(phone, code);
  if (!sent.ok) {
    console.error("phone/send:", sent.error);
    return NextResponse.json({ error: "sms_failed", message: "Не получилось отправить SMS. Попробуй позже" }, { status: 502 });
  }

  await admin.from("phone_otps").upsert({
    phone,
    code_hash: hashOtp(phone, code),
    expires_at: new Date(now + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    sent_count: sentCount,
    window_started_at: windowStartedAt,
    last_sent_at: new Date(now).toISOString(),
  });

  return NextResponse.json({ status: "sent", phone, resendIn: RESEND_SECONDS });
}
