import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueMorningReminders } from "@/lib/morning-reminders/send";

/**
 * GET /api/cron/send-morning-reminders
 *
 * Часто (см. vercel.json) проверяет, не подошло ли время отправить
 * кому-то утреннее напоминание, и отправляет — с полным набором проверок
 * (согласие, активность сегодня, попадание в окно) внутри
 * lib/morning-reminders/send.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await sendDueMorningReminders(admin);

  return NextResponse.json(result);
}
