import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOtp, hashOtp, normalizeEmail } from "@/lib/mobile/auth";
import { sendEmailCode } from "@/lib/mobile/email";

/**
 * POST /api/auth/mobile/email/send  { email }
 * Отправляет 4-значный код на почту. Не чаще раза в 60 секунд и не больше 10 писем в сутки на адрес.
 */
const RESEND_SECONDS = 60;
const MAX_PER_DAY = 10;
const CODE_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "invalid_email", message: "Проверь адрес почты" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: prev } = await admin.from("email_otps").select("*").eq("email", email).maybeSingle();
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
    if (now - new Date(prev.window_started_at).getTime() < 24 * 3600 * 1000) {
      if (prev.sent_count >= MAX_PER_DAY) {
        return NextResponse.json({ error: "too_many", message: "Слишком много попыток. Попробуй завтра" }, { status: 429 });
      }
      sentCount = prev.sent_count + 1;
      windowStartedAt = prev.window_started_at;
    }
  }

  const code = generateOtp();
  const sent = await sendEmailCode(email, code);
  if (!sent.ok) {
    return NextResponse.json({ error: "email_failed", message: "Не получилось отправить письмо. Попробуй позже" }, { status: 502 });
  }

  await admin.from("email_otps").upsert({
    email,
    code_hash: hashOtp(email, code),
    expires_at: new Date(now + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    sent_count: sentCount,
    window_started_at: windowStartedAt,
    last_sent_at: new Date(now).toISOString(),
  });

  return NextResponse.json({ status: "sent", email, resendIn: RESEND_SECONDS });
}
