import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { eventTiming } from "@/lib/events/timing";

/** Через сколько после окончания бизнес-события организатору приходят итоги (один раз). */
const BUSINESS_RESULTS_DELAY_HOURS = 12;

/**
 * Сразу после того, как кто-то оценил встречу, рассылает ВСЕМ участникам
 * личное сообщение от бота (в Telegram, в чат с ботом — не в общий канал)
 * с текущими итогами: средняя оценка, сколько человек уже оценили, что
 * говорят (пришли вовремя / приятное общение / встретились бы снова).
 *
 * Вызывается сразу в POST /api/reviews после сохранения отзыва — без
 * задержки. Если оценки продолжат поступать позже — каждая следующая
 * тоже разошлёт обновлённую сводку, поэтому специальной защиты "уже
 * отправляли" не нужно: это не разовое уведомление о встрече, а
 * актуальная сводка на каждый момент.
 */
export async function sendEventResultsNow(admin: ReturnType<typeof createAdminClient>, eventId: string): Promise<void> {
  const [{ data: event }, { data: reviews }, { data: members }] = await Promise.all([
    admin.from("events").select("title, is_business").eq("id", eventId).maybeSingle(),
    admin
      .from("reviews")
      .select("rating, arrived_on_time, pleasant_communication, would_meet_again")
      .eq("event_id", eventId),
    admin.from("event_members").select("users(telegram_id)").eq("event_id", eventId),
  ]);

  if (!event || !reviews || reviews.length === 0) return;
  // Бизнес-события: никаких сводок после каждой оценки — организатор
  // получит итоги один раз (sendDueBusinessResults), гостям сводка не нужна.
  if (event.is_business) return;

  const recipients = (members ?? [])
    .map((m) => (m.users as unknown as { telegram_id: number } | null)?.telegram_id)
    .filter((id): id is number => typeof id === "number");

  if (recipients.length === 0) return;

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const onTimePct = Math.round((reviews.filter((r) => r.arrived_on_time).length / reviews.length) * 100);
  const pleasantPct = Math.round((reviews.filter((r) => r.pleasant_communication).length / reviews.length) * 100);
  const meetAgainPct = Math.round((reviews.filter((r) => r.would_meet_again).length / reviews.length) * 100);

  const stars = "⭐".repeat(Math.round(avgRating));
  const text =
    `Итоги встречи «${event.title}»\n\n` +
    `${stars} ${avgRating.toFixed(1)} из 5 (${reviews.length} ${pluralizeReviews(reviews.length)})\n\n` +
    `Пришли вовремя: ${onTimePct}%\n` +
    `Приятное общение: ${pleasantPct}%\n` +
    `Хотели бы встретиться снова: ${meetAgainPct}%`;

  for (const telegramId of recipients) {
    await notifyTelegram(telegramId, text);
  }
}

/**
 * Итоги бизнес-событий — ОДИН раз организатору, через
 * BUSINESS_RESULTS_DELAY_HOURS после окончания (гости успевают оценить).
 * Вызывается из cron /api/cron/complete-events. Сначала ставим
 * results_sent_at (условно, только если ещё null), потом шлём —
 * повторный/параллельный запуск дубля не пришлёт.
 */
export async function sendDueBusinessResults(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: candidates } = await admin
    .from("events")
    .select("id, title, organizer_id, event_date, event_time, event_end_time, city, longitude")
    .eq("is_business", true)
    .eq("status", "completed")
    .is("results_sent_at", null)
    .limit(50);

  const now = Date.now();
  const due = (candidates ?? []).filter(
    (e) => eventTiming(e).end.getTime() + BUSINESS_RESULTS_DELAY_HOURS * 60 * 60 * 1000 <= now
  );

  let sent = 0;
  for (const event of due) {
    const { data: claimed } = await admin
      .from("events")
      .update({ results_sent_at: new Date().toISOString() })
      .eq("id", event.id)
      .is("results_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const [{ data: reviews }, { count: guests }, { data: organizer }] = await Promise.all([
      admin
        .from("reviews")
        .select("rating, arrived_on_time, pleasant_communication, would_meet_again")
        .eq("event_id", event.id)
        .eq("reviewee_id", event.organizer_id),
      admin
        .from("event_members")
        .select("user_id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("role", "participant"),
      admin.from("users").select("telegram_id").eq("id", event.organizer_id).maybeSingle(),
    ]);

    const telegramId = organizer?.telegram_id;
    if (!telegramId) continue;

    const list = reviews ?? [];
    let text: string;
    if (list.length === 0) {
      text =
        `Итоги события «${event.title}»\n\n` +
        `Гостей: ${guests ?? 0}. Оценок пока нет.`;
    } else {
      const avg = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
      const pct = (f: (r: (typeof list)[number]) => boolean | null) =>
        Math.round((list.filter((r) => f(r)).length / list.length) * 100);
      text =
        `Итоги события «${event.title}»\n\n` +
        `${"⭐".repeat(Math.round(avg))} ${avg.toFixed(1)} из 5 (${list.length} ${pluralizeReviews(list.length)})\n` +
        `Гостей: ${guests ?? 0}\n\n` +
        `Приятная атмосфера: ${pct((r) => r.pleasant_communication)}%\n` +
        `Придут снова: ${pct((r) => r.would_meet_again)}%`;
    }
    await notifyTelegram(telegramId, text);
    sent++;
  }
  return sent;
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "оценка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "оценки";
  return "оценок";
}
