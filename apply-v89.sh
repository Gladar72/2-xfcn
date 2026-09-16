mkdir -p "lib/reviews"
cat > "lib/reviews/timezone.ts" << 'ENDOFFILE'
/**
 * Грубая оценка смещения UTC для точки на территории России по долготе.
 * Нужна, потому что event_time хранится "наивным" временем — тем самым,
 * что организатор ввёл на своём телефоне (в СВОЁМ местном поясе), без
 * привязки к часовому поясу. Сравнивать такое значение с now() (который
 * всегда в UTC) напрямую нельзя — разница в несколько часов может сделать
 * встречу либо "уже прошедшей", когда она ещё идёт, либо наоборот
 * "ещё идущей" на самом деле давно закончившуюся (см. lib/reviews/complete-due-events.ts).
 *
 * Границы примерные (реальные пояса не строго вертикальные по карте), но
 * этого достаточно, чтобы не промахиваться на много часов, как было раньше
 * без всякой поправки вообще.
 */
export function estimateRussiaUtcOffsetHours(longitude: number | null | undefined): number {
  if (longitude == null) return 3; // нет координат — считаем московское время (самый частый случай)
  if (longitude < 30) return 2; // Калининград
  if (longitude < 41) return 3; // Москва и европейская часть России
  if (longitude < 49) return 4; // Самара, Ижевск
  if (longitude < 61) return 5; // Екатеринбург, Тюмень
  if (longitude < 76) return 6; // Омск
  if (longitude < 105) return 7; // Красноярск, Новосибирск
  if (longitude < 116) return 8; // Иркутск
  if (longitude < 133) return 9; // Якутск, Чита
  if (longitude < 145) return 10; // Владивосток
  if (longitude < 156) return 11; // Сахалин, Магадан
  return 12; // Камчатка, Чукотка
}

/**
 * Превращает "наивную" пару дата+время (введённую организатором в своём
 * местном поясе) в настоящий момент UTC — с поправкой на оценённое
 * смещение пояса по долготе точки встречи.
 */
export function localEventTimeToUtc(dateIso: string, timeIso: string, longitude: number | null | undefined): Date {
  const offsetHours = estimateRussiaUtcOffsetHours(longitude);
  // "Z" заставляет распарсить как UTC независимо от таймзоны процесса —
  // без этого поведение зависело бы от TZ окружения сервера.
  const naiveAsUtc = new Date(`${dateIso}T${timeIso}Z`);
  return new Date(naiveAsUtc.getTime() - offsetHours * 60 * 60 * 1000);
}
ENDOFFILE

mkdir -p "lib/reviews"
cat > "lib/reviews/complete-due-events.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";
import { localEventTimeToUtc } from "@/lib/reviews/timezone";

const ASSUMED_EVENT_DURATION_HOURS = 2; // считаем встречу завершённой через 2ч после начала, если явно не закрыта раньше

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

