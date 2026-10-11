import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/mobile/auth";
import { attachEmail, checkAndConsumeEmailOtp } from "@/lib/mobile/otp";

/**
 * POST /api/me/email  { email, code }
 * Привязка почты к профилю (например, вошёл через Telegram). Код — через /api/auth/mobile/email/send.
 * После этого можно входить и по почте, и через Telegram — в один аккаунт.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!email || code.length !== 4) {
    return NextResponse.json({ error: "invalid_input", message: "Введи почту и 4 цифры из письма" }, { status: 422 });
  }

  const admin = createAdminClient();
  const check = await checkAndConsumeEmailOtp(admin, email, code);
  if (!check.ok) return NextResponse.json({ error: check.error, message: check.message }, { status: check.status });

  const attached = await attachEmail(admin, user.userId, email);
  if (!attached.ok) return NextResponse.json({ error: attached.error, message: attached.message }, { status: attached.status });
  return NextResponse.json({ ok: true, email });
}
