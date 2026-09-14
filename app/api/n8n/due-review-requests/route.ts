import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

/**
 * GET /api/n8n/due-review-requests
 *
 * Workflow 5 (п.27 ТЗ): "После встречи → запросить отзыв". Основная логика
 * (перевод статуса, создание уведомлений в БД) вынесена в
 * lib/reviews/complete-due-events.ts — та же функция вызывается прямо из
 * приложения (GET /api/reviews/reviewable), так что этот n8n-опрос — не
 * единственный триггер, а регулярная подстраховка: именно он даёт n8n
 * список telegram_id, чтобы реально отправить push в Telegram, даже если
 * пользователь не открывал приложение после встречи.
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const items = await completeDueEvents(admin);

  return NextResponse.json({ items });
}
