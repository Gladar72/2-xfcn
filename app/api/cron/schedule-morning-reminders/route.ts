import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleCurrentWeekReminders } from "@/lib/morning-reminders/schedule";

/**
 * GET /api/cron/schedule-morning-reminders
 *
 * Раз в день (см. vercel.json) досоздаёт расписание утренних напоминаний
 * на текущую неделю для пользователей, у которых его ещё нет — так
 * подхватываются и новые регистрации в течение недели, а не только
 * существующие пользователи по понедельникам.
 *
 * Идемпотентно само по себе (см. lib/morning-reminders/schedule.ts) —
 * повторный или параллельный запуск ничего не задваивает.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await scheduleCurrentWeekReminders(admin);

  return NextResponse.json(result);
}
