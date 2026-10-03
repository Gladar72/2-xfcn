import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/mobile/auth";
import { attachPhone, checkAndConsumeOtp } from "@/lib/mobile/otp";

/**
 * POST /api/me/phone  { phone, code }
 * Привязка номера к уже существующему профилю (например, вошёл через Telegram).
 * Код сначала запрашивается через POST /api/auth/mobile/phone/send.
 * После этого в приложение можно входить и по SMS — в тот же аккаунт.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(body?.phone);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 4) {
    return NextResponse.json({ error: "invalid_input", message: "Введи номер и 4 цифры из SMS" }, { status: 422 });
  }

  const admin = createAdminClient();
  const check = await checkAndConsumeOtp(admin, phone, code);
  if (!check.ok) return NextResponse.json({ error: check.error, message: check.message }, { status: check.status });

  const attached = await attachPhone(admin, user.userId, phone);
  if (!attached.ok) return NextResponse.json({ error: attached.error, message: attached.message }, { status: attached.status });

  return NextResponse.json({ ok: true, phone });
}
