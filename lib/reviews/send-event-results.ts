import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";

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
    admin.from("events").select("title").eq("id", eventId).maybeSingle(),
    admin
      .from("reviews")
      .select("rating, arrived_on_time, pleasant_communication, would_meet_again")
      .eq("event_id", eventId),
    admin.from("event_members").select("users(telegram_id)").eq("event_id", eventId),
  ]);

  if (!event || !reviews || reviews.length === 0) return;

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

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "оценка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "оценки";
  return "оценок";
}
