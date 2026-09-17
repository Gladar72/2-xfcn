cat > "lib/reviews/complete-due-events.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";
import { localEventTimeToUtc } from "@/lib/reviews/timezone";

const ASSUMED_EVENT_DURATION_HOURS = 4; // допущение для старых встреч без указанного времени окончания — увеличено с 2ч по явному запросу (2ч закрывало чат слишком рано для встреч вроде "Учёба")

export interface DueReviewItem {
  eventId: string;
  title: string;
  recipients: number[]; // telegram_id получателей — для n8n, чтобы реально отправить сообщение
}

/**
 * Переводит просроченные опубликованные встречи в статус 'completed' и
 * создаёт уведомления review_request участникам. Идемпотентна (safe re-run) —
 * условие status='published' и проверка "уже уведомлён" защищают от дублей.
 * Возвращает список ТОЛЬКО ЧТО обработанных встреч с telegram_id получателей —
 * нужно, чтобы n8n-воркфлоу знал, кому реально отправить сообщение в Telegram
 * (после первого вызова эти события больше не попадут в возврат повторно).
 *
 * Раньше это работало ТОЛЬКО через внешний n8n-опрос (см.
 * app/api/n8n/due-review-requests/route.ts), и если n8n не настроен —
 * встречи никогда не завершались и окно с отзывом не появлялось.
 * Теперь эта же функция вызывается лениво прямо из приложения
 * (GET /api/reviews/reviewable) при каждом заходе — работает без n8n.
 */
export async function completeDueEvents(
  admin: ReturnType<typeof createAdminClient>
): Promise<DueReviewItem[]> {
  const now = new Date();
  // Небольшой запас вперёд по UTC-дате: в восточных поясах России
  // (Владивосток, Камчатка) местная календарная дата события может уже
  // быть "завтра" по UTC, хотя по факту встреча ещё даже не началась —
  // точную проверку всё равно делает fine-grained сравнение ниже, эта
  // дата — только грубый предварительный фильтр кандидатов.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, event_date, event_time, event_end_time, longitude")
    .eq("status", "published")
    .lte("event_date", tomorrowIso);

  const finished = (candidates ?? []).filter((e) => {
    // event_time/event_end_time — "наивное" время: то самое, что
    // организатор ввёл у себя на телефоне, БЕЗ привязки к часовому поясу.
    // Раньше это сравнивалось с now() (UTC) напрямую, как будто оно уже
    // в UTC — из-за этого встречи в поясах восточнее Москвы (Тюмень,
    // Екатеринбург и дальше) считались "ещё идущими" на несколько часов
    // дольше, чем на самом деле. Теперь поправка на пояс — по долготе
    // точки встречи (см. lib/reviews/timezone.ts).
    const start = localEventTimeToUtc(e.event_date, e.event_time, e.longitude);
    const end = e.event_end_time
      ? localEventTimeToUtc(e.event_date, e.event_end_time, e.longitude)
      : new Date(start.getTime() + ASSUMED_EVENT_DURATION_HOURS * 60 * 60 * 1000);
    return end <= now;
  });

  if (finished.length === 0) return [];

  const finishedIds = finished.map((e) => e.id);

  await admin.from("events").update({ status: "completed" }).in("id", finishedIds).eq("status", "published");

  const { data: allFinishedMembers } = await admin
    .from("event_members")
    .select("user_id")
    .in("event_id", finishedIds);
  const uniqueMemberIds = Array.from(new Set((allFinishedMembers ?? []).map((m) => m.user_id)));
  if (uniqueMemberIds.length > 0) {
    await admin.rpc("increment_completed_meetings", { p_user_ids: uniqueMemberIds });
  }

  const { data: alreadyNotified } = await admin
    .from("notifications")
    .select("payload")
    .eq("type", "review_request");
  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId).filter(Boolean)
  );

  const toNotify = finished.filter((e) => !alreadyNotifiedEventIds.has(e.id));
  if (toNotify.length === 0) return [];

  const { data: members } = await admin
    .from("event_members")
    .select("event_id, users(id, telegram_id)")
    .in(
      "event_id",
      toNotify.map((e) => e.id)
    );

  await admin.from("notifications").insert(
    toNotify.flatMap((event) =>
      (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => (m.users as unknown as { id: string } | null)?.id)
        .filter((id): id is string => !!id)
        .map((userId) => ({ user_id: userId, type: "review_request", payload: { eventId: event.id } }))
    )
  );

  return toNotify
    .map((event) => {
      const recipients = (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => (m.users as unknown as { telegram_id: number } | null)?.telegram_id)
        .filter((id): id is number => typeof id === "number");
      return { eventId: event.id, title: event.title, recipients };
    })
    .filter((item) => item.recipients.length > 0);
}
ENDOFFILE
