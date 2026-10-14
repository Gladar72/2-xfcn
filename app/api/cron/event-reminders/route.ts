import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { sendDueEventReminders } from "@/lib/telegram/event-reminders";
import { sendDueShareNudges } from "@/lib/telegram/share-nudge";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/event-reminders
 *
 * Раз в 5 минут (см. vercel.json): напоминание за 2 часа до встречи с
 * кнопками «✅ Иду» / «❌ Не смогу» и повтор за час тем, кто не ответил.
 * Логика — lib/telegram/event-reminders.ts.
 * Здесь же — «никто не откликнулся, поделись событием» (lib/telegram/share-nudge.ts).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const api = getBot().api;
  const result = await sendDueEventReminders(admin, api);
  const nudges = await sendDueShareNudges(admin, api).catch((e) => {
    console.error("share-nudge", e);
    return { nudged: 0 };
  });
  return NextResponse.json({ ...result, ...nudges });
}
