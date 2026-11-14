import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";

/**
 * POST /api/auth/mobile/telegram/start → { token, botUrl }
 * Вход через бота: приложение открывает botUrl (Telegram), человек жмёт «Старт» —
 * бот подтверждает аккаунт, приложение забирает вход через /poll.
 */
export async function POST() {
  const token = randomBytes(18).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const admin = createAdminClient();
  // Старые токены подчищаем заодно.
  await admin.from("mobile_tg_logins").delete().lt("created_at", new Date(Date.now() - 864e5).toISOString());
  const { error } = await admin.from("mobile_tg_logins").insert({ token });
  if (error) return NextResponse.json({ error: "start_failed" }, { status: 500 });
  return NextResponse.json({ token, botUrl: `https://t.me/${BOT}?start=login_${token}` });
}
