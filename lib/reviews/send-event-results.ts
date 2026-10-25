import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { sendPushToUsers } from "@/lib/push/expo";
import { shortTitle } from "@/lib/notify/user";
import { eventTiming } from "@/lib/events/timing";

/**
 * Итоги бизнес-события организатору — ОДИН раз: когда оценили все гости,
 * либо через столько часов после окончания (кто успел — тот успел).
 */
const BUSINESS_RESULTS_DELAY_HOURS = 24;

/**
 * Итоги события (любого — личной встречи и бизнес-события) — ОДИН общий итог
 * только создателю: как только оценили все гости, или через
 * BUSINESS_RESULTS_DELAY_HOURS после окончания — что наступит раньше.
 * Гости сводок не получают: оценивают событие один раз и всё.
 * Вызывается из cron /api/cron/complete-events. Сначала ставим
 * results_sent_at (условно, только если ещё null), потом шлём —
 * повторный/параллельный запуск дубля не пришлёт.
 */
export async function sendDueEventResults(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: candidates } = await admin
    .from("events")
    .select("id, title, is_business, organizer_id, event_date, event_time, event_end_time, city, longitude")
    .eq("status", "completed")
    .is("results_sent_at", null)
    // Только недавние: старым встречам итоги задним числом не шлём.
    .gte("event_date", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .limit(50);

  const now = Date.now();

  let sent = 0;
  for (const event of candidates ?? []) {
    const timeIsUp = eventTiming(event).end.getTime() + BUSINESS_RESULTS_DELAY_HOURS * 60 * 60 * 1000 <= now;
    if (!timeIsUp) {
      // Раньше срока — только если уже оценили ВСЕ гости.
      const [{ count: rated }, { count: total }] = await Promise.all([
        admin
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("reviewee_id", event.organizer_id),
        admin
          .from("event_members")
          .select("user_id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("role", "participant"),
      ]);
      if (!total || (rated ?? 0) < total) continue;
    }

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

    // Никто не пришёл — итоги слать не о чем.
    if (!guests) continue;
    const telegramId = organizer?.telegram_id;

    const list = reviews ?? [];
    const kind = event.is_business ? "события" : "встречи";
    let text: string;
    if (list.length === 0) {
      text =
        `Итоги ${kind} «${event.title}»\n\n` +
        `Гостей: ${guests ?? 0}. Оценок пока нет.`;
    } else {
      const avg = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
      const pct = (f: (r: (typeof list)[number]) => boolean | null) =>
        Math.round((list.filter((r) => f(r)).length / list.length) * 100);
      text =
        `Итоги ${kind} «${event.title}»\n\n` +
        `${"⭐".repeat(Math.round(avg))} ${avg.toFixed(1)} из 5 (${list.length} ${pluralizeReviews(list.length)})\n` +
        `Гостей: ${guests ?? 0}\n\n` +
        `Приятная атмосфера: ${pct((r) => r.pleasant_communication)}%\n` +
        `Придут снова: ${pct((r) => r.would_meet_again)}%`;
    }
    if (telegramId) await notifyTelegram(telegramId, text);
    await sendPushToUsers(admin, [event.organizer_id as string], {
      title: `Итоги ${kind} «${shortTitle(event.title)}»`,
      body:
        list.length === 0
          ? `Гостей: ${guests ?? 0}. Оценок пока нет`
          : `${(list.reduce((sum, r) => sum + r.rating, 0) / list.length).toFixed(1)} из 5 · ${list.length} ${pluralizeReviews(list.length)} · гостей: ${guests ?? 0}`,
      data: { url: `/event/${event.id}`, type: event.is_business ? "business_results" : "event_results", eventId: event.id },
    });
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
