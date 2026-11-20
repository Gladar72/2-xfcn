import { randomBytes } from "node:crypto";
import { createTelegramAttempt } from "@/lib/mobile/telegram-attempt";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";

/**
 * POST /api/auth/mobile/telegram/start → { token, botUrl }
 * Вход через бота: приложение открывает botUrl (Telegram), человек жмёт «Старт» —
 * бот подтверждает аккаунт, приложение забирает вход через /poll.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, proof } = body?.recoverable === true
    ? createTelegramAttempt(typeof body.phoneTicket === "string" ? body.phoneTicket : "")
    : { token: randomBytes(12).toString("hex"), proof: undefined };
  const admin = createAdminClient({ noStore: true });
  // Старые токены подчищаем заодно.
  await admin.from("mobile_tg_logins").delete().lt("created_at", new Date(Date.now() - 864e5).toISOString());
  const { error } = await admin.from("mobile_tg_logins").insert({ token });
  if (error) return NextResponse.json({ error: "start_failed" }, { status: 500 });
  return NextResponse.json({ token, proof, botUrl: `https://t.me/${BOT}?start=login_${token}` });
}
