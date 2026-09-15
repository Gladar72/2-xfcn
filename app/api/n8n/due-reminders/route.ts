import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";
import { notifyTelegram } from "@/lib/telegram/notify";

const REMINDER_WINDOW_MINUTES = 15; // n8n дёргает раз в 15 минут — окно должно совпадать с частотой опроса

/**
 * GET /api/n8n/due-reminders
 *
 * Workflow 4 (п.27 ТЗ): "За 2 часа до встречи → reminder".
 * Идемпотентность: помечаем notifications с type='event_reminder', чтобы
 * при повторном опросе n8n (каждые ~15 минут) не отправить одно и то же
 * напоминание дважды.
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() + (120 - REMINDER_WINDOW_MINUTES / 2) * 60 * 1000);
  const windowEnd = new Date(now.getTime() + (120 + REMINDER_WINDOW_MINUTES / 2) * 60 * 1000);

  const { data: events } = await admin
    .from("events")
    .select("id, title, place_name, event_date, event_time, organizer_id")
    .eq("status", "published")
    .gte("event_date", now.toISOString().slice(0, 10))
    .lte("event_date", windowEnd.toISOString().slice(0, 10));

  const dueEvents = (events ?? []).filter((e) => {
    const dt = new Date(`${e.event_date}T${e.event_time}`);
    return dt >= windowStart && dt <= windowEnd;
  });

  if (dueEvents.length === 0) return NextResponse.json({ items: [] });

  const eventIds = dueEvents.map((e) => e.id);

  const [{ data: alreadyNotified }, { data: members }] = await Promise.all([
    admin.from("notifications").select("payload").eq("type", "event_reminder"),
    admin
      .from("event_members")
      .select("event_id, users(id, telegram_id)")
      .in("event_id", eventIds),
  ]);

  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? [])
      .map((n) => (n.payload as { eventId?: string } | null)?.eventId)
      .filter(Boolean)
  );

  const items = dueEvents
    .filter((e) => !alreadyNotifiedEventIds.has(e.id))
    .map((event) => {
      const recipients = (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => m.users as unknown as { id: string; telegram_id: number } | null)
        .filter((u): u is { id: string; telegram_id: number } => !!u);
      return {
        eventId: event.id,
        title: event.title,
        placeName: event.place_name,
        eventTime: event.event_time,
        recipients: recipients.map((r) => r.telegram_id),
      };
    })
    .filter((item) => item.recipients.length > 0);

  // Помечаем как отправленные СРАЗУ (до реального успеха отправки в Telegram)
  // — сознательный компромисс: лучше пропустить редкое напоминание при сбое
  // n8n, чем засыпать пользователя дублями. Возврат к строгой idempotency
  // возможен позже через отдельный статус доставки, если понадобится.
  if (items.length > 0) {
    await admin.from("notifications").insert(
      items.flatMap((item) =>
        (members ?? [])
          .filter((m) => m.event_id === item.eventId)
          .map((m) => ({
            user_id: (m.users as unknown as { id: string } | null)?.id,
            type: "event_reminder",
            payload: { eventId: item.eventId },
          }))
          .filter((n) => n.user_id)
      )
    );

    // Отправляем напрямую через бота (не полагаясь ТОЛЬКО на то, что n8n
    // сам разошлёт сообщения по возвращённому списку items) — так
    // напоминание точно дойдёт, даже если workflow в n8n не настроен.
    await Promise.all(
      items.flatMap((item) =>
        item.recipients.map((telegramId) =>
          notifyTelegram(
            telegramId,
            `⏰ Скоро встреча «${item.title}»${item.placeName ? ` в «${item.placeName}»` : ""} — в ${item.eventTime.slice(0, 5)}`
          )
        )
      )
    );
  }

  return NextResponse.json({ items });
}
