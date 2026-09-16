import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

/**
 * GET /api/cron/complete-events
 *
 * Раньше автозавершение просроченных встреч (перевод в 'completed',
 * закрытие чата, открытие окна отзывов) проверялось ПРЯМО в GET /api/events
 * и GET /api/events/map — на самом горячем пути приложения (лента,
 * карта). Это добавляло лишний поход в базу на каждое открытие ленты,
 * даже когда завершать было нечего. Теперь это делает Vercel Cron раз в
 * 5 минут (см. vercel.json) — лента и карта больше этим не занимаются.
 *
 * Защищено CRON_SECRET — так Vercel документирует защиту cron-эндпоинтов
 * от вызова кем попало: Vercel сам добавляет этот заголовок при вызове по
 * расписанию, обычные запросы его не знают.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await completeDueEvents(admin);

  return NextResponse.json({ completed: result.length });
}
