import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { sendDueEventReminders } from "@/lib/telegram/event-reminders";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/event-reminders
 *
 * Раз в 5 минут (см. vercel.json): напоминание за 2 часа до встречи с
 * кнопками «✅ Иду» / «❌ Не смогу» и повтор за час тем, кто не ответил.
 * Логика — lib/telegram/event-reminders.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDueEventReminders(createAdminClient(), getBot().api);
  return NextResponse.json(result);
}
