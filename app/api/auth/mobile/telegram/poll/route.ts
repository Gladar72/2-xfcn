import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { telegramSignIn } from "@/lib/mobile/telegram-signin";

import { isDeviceAttempt, matchesDevice } from "@/lib/mobile/telegram-attempt";

const TTL_MS = 10 * 60 * 1000;

/**
 * POST /api/auth/mobile/telegram/poll  { token, phoneTicket? }
 * → { status: "pending" } пока бот не подтвердил; { error: "expired" } — токен устарел;
 * иначе — тот же ответ, что у входа через Telegram (сессия или анкета). Токен одноразовый.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^[a-zA-Z0-9]{16,40}$/.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  const protectedAttempt = isDeviceAttempt(token);
  const linkTicket = typeof body?.phoneTicket === "string" ? body.phoneTicket : "";
  if (protectedAttempt && !matchesDevice(token, body?.proof, linkTicket)) {
    return NextResponse.json({ error: "bad_token" }, { status: 403 });
  }
  const admin = createAdminClient({ noStore: true });
  const { data: row, error: readError } = await admin
    .from("mobile_tg_logins")
    .select("telegram_id, first_name, username, created_at, confirmed_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!row || (row.used_at && !protectedAttempt) || Date.now() - new Date(row.created_at as string).getTime() > TTL_MS) {
    return NextResponse.json({ error: "expired", message: "Ссылка для входа устарела — нажми «Войти через Telegram» ещё раз" }, { status: 410 });
  }
  if (!row.confirmed_at || !row.telegram_id) return NextResponse.json({ status: "pending" });
  // Атомарно отмечаем первое получение. Старые сборки по-прежнему могут забрать ответ лишь один раз.
  let first = false;
  const claimedAt = new Date().toISOString();
  if (!row.used_at) {
    const { data, error } = await admin.from("mobile_tg_logins").update({ used_at: claimedAt })
      .eq("token", token).is("used_at", null).select("token");
    if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    first = Boolean(data?.length);
    if (!first && !protectedAttempt) return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  const [payload, status] = await telegramSignIn(
    admin,
    { id: Number(row.telegram_id), username: row.username as string | null, first_name: row.first_name as string | null },
    protectedAttempt ? { phoneTicket: linkTicket } : { phoneTicket: body?.phoneTicket, emailTicket: body?.emailTicket }
  );
  if (first && status >= 500) {
    await admin.from("mobile_tg_logins").update({ used_at: null }).eq("token", token).eq("used_at", claimedAt);
  }
  return NextResponse.json(payload, { status });
}
