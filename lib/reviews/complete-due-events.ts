import type { createAdminClient } from "@/lib/supabase/admin";
import { eventTiming } from "@/lib/events/timing";

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
    .select("id, title, event_date, event_time, event_end_time, longitude, city")
    // "closed" (заполнена целиком) тоже нужно проверять — иначе заполненная
    // встреча, у которой уже прошло время, никогда не завершается, и её
    // чат остаётся открытым навсегда (реальный найденный случай).
    .in("status", ["published", "closed"])
    .lte("event_date", tomorrowIso);

  // Встреча идёт ровно до времени окончания и ещё 30 минут после него
  // (COMPLETION_GRACE_MINUTES) — только потом закрывается автоматически.
  // Организатор может завершить её сам раньше (PATCH action "complete").
  const finished = (candidates ?? []).filter((e) => eventTiming(e).autoCompleteAt <= now);

  if (finished.length === 0) return [];
  return finalizeCompletedEvents(admin, finished);
}

/**
 * Завершает встречи: статус 'completed', +1 посещённая встреча участникам,
 * запросы отзывов. Общая для автозавершения по времени и для ручного
 * «Завершить встречу» организатором. Встречи, которые уже кто-то завершил
 * (параллельный запуск), повторно не обрабатываются.
 */
export async function finalizeCompletedEvents(
  admin: ReturnType<typeof createAdminClient>,
  events: { id: string; title: string }[]
): Promise<DueReviewItem[]> {
  if (events.length === 0) return [];

  const { data: updatedRows } = await admin
    .from("events")
    .update({ status: "completed" })
    .in(
      "id",
      events.map((e) => e.id)
    )
    .in("status", ["published", "closed"])
    .select("id");
  const updatedIds = new Set((updatedRows ?? []).map((r) => r.id));
  const finished = events.filter((e) => updatedIds.has(e.id));
  if (finished.length === 0) return [];
  const finishedIds = finished.map((e) => e.id);

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
