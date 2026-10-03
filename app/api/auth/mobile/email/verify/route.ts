import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueRegistrationTicket, normalizeEmail } from "@/lib/mobile/auth";
import { checkAndConsumeEmailOtp } from "@/lib/mobile/otp";
import { mobileSessionPayload } from "@/lib/mobile/session-response";

/**
 * POST /api/auth/mobile/email/verify  { email, code }
 * → { status: "authenticated", token, user } — почта уже привязана к профилю;
 * → { status: "needs_registration", ticket } — новый пользователь, дальше /api/auth/mobile/register.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!email || code.length !== 4) {
    return NextResponse.json({ error: "invalid_input", message: "Введи 4 цифры из письма" }, { status: 422 });
  }

  const admin = createAdminClient();
  const check = await checkAndConsumeEmailOtp(admin, email, code);
  if (!check.ok) return NextResponse.json({ error: check.error, message: check.message }, { status: check.status });

  const { data: user } = await admin
    .from("users")
    .select("id, telegram_id, moderation_status")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ status: "needs_registration", ticket: issueRegistrationTicket({ kind: "email", email }) });
  }
  if (user.moderation_status === "banned") {
    return NextResponse.json({ error: "user_banned" }, { status: 403 });
  }
  return NextResponse.json(await mobileSessionPayload(admin, user));
}
