import { GrammyError } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { pickNextMessage, type ReminderHistoryEntry } from "@/lib/morning-reminders/pick-message";

// Сколько времени после запланированного момента ещё можно отправить
// сообщение (например, cron не успел на предыдущем тике) — но не позже
// конца утреннего окна пользователя, чтобы не "переносить на ночь" (см. ТЗ).
const LATE_SEND_GRACE_MINUTES = 30;

/**
 * Отправляет все "созревшие" (scheduled_at <= сейчас) напоминания со
 * статусом pending. Рассчитана на частый запуск (см. vercel.json) —
 * каждый вызов забирает то, что успело подойти по времени, ничего не
 * копит и не переносит на ночь.
 *
 * Защита от дублей при нескольких экземплярах/повторных запусках —
 * атомарный захват строки (UPDATE ... WHERE status='pending', с select
 * результата): если строку уже забрал другой процесс, select вернёт
 * пусто, и мы просто пропускаем её вместо повторной отправки.
 */
export async function sendDueMorningReminders(admin: ReturnType<typeof createAdminClient>): Promise<{
  sent: number;
  skipped: number;
}> {
  const now = new Date();

  const { data: due } = await admin
    .from("morning_reminders")
    .select("id, user_id, scheduled_at")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .limit(200);

  if (!due || due.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const reminder of due) {
    const { data: user } = await admin
      .from("users")
      .select("id, telegram_id, city, morning_reminders_enabled, moderation_status, last_active_at")
      .eq("id", reminder.user_id)
      .maybeSingle();

    if (!user || !user.morning_reminders_enabled || user.moderation_status !== "active") {
      await admin.from("morning_reminders").update({ status: "skipped_disabled" }).eq("id", reminder.id).eq("status", "pending");
      skipped++;
      continue;
    }

    // "Пропущенные сообщения не отправляй пачкой и не переноси на ночь" —
    // если момент давно прошёл (за пределами окна + запас), просто
    // отменяем этот слот, а не шлём его посреди дня/ночи.
    const scheduledAt = new Date(reminder.scheduled_at);
    const minutesLate = (now.getTime() - scheduledAt.getTime()) / 60000;
    if (minutesLate > LATE_SEND_GRACE_MINUTES) {
      await admin.from("morning_reminders").update({ status: "cancelled" }).eq("id", reminder.id).eq("status", "pending");
      skipped++;
      continue;
    }

    // Раньше здесь была проверка "уже заходил сегодня — не напоминаем
    // повторно" — убрана по явной просьбе пользователя: напоминания
    // через день должны приходить всем одинаково, вне зависимости от
    // того, заходил человек в приложение или нет.

    // Атомарный захват — если проиграли гонку другому запуску, claimed
    // будет пустым и мы просто идём дальше.
    const { data: claimed } = await admin
      .from("morning_reminders")
      .update({ status: "sending" })
      .eq("id", reminder.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const { data: historyRows } = await admin
      .from("morning_reminders")
      .select("message_id, topic, greeting_key, sent_at")
      .eq("user_id", user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false });

    const history: ReminderHistoryEntry[] = (historyRows ?? []).map((h) => ({
      messageId: h.message_id,
      topic: h.topic,
      greetingKey: h.greeting_key,
    }));

    const message = pickNextMessage(history);

    try {
      await sendReminderMessage(user.telegram_id, message.text);
      await admin
        .from("morning_reminders")
        .update({
          status: "sent",
          message_id: message.id,
          topic: message.topic,
          greeting_key: message.greetingKey,
          sent_at: new Date().toISOString(),
        })
        .eq("id", reminder.id);
      sent++;
    } catch (err) {
      const blocked = err instanceof GrammyError && err.error_code === 403;
      if (blocked) {
        // Заблокировал бота или удалил аккаунт — прекращаем попытки
        // насовсем, а не только для этого слота.
        await admin.from("users").update({ morning_reminders_enabled: false }).eq("id", user.id);
        await admin.from("morning_reminders").update({ status: "failed" }).eq("id", reminder.id);
      } else {
        // Временная ошибка — возвращаем в pending, чтобы повторить на
        // следующем тике cron (см. LATE_SEND_GRACE_MINUTES — не бесконечно).
        console.error(`sendDueMorningReminders — временная ошибка отправки (${reminder.id}):`, err);
        await admin.from("morning_reminders").update({ status: "pending" }).eq("id", reminder.id);
      }
      skipped++;
    }
  }

  return { sent, skipped };
}

async function sendReminderMessage(telegramId: number, text: string): Promise<void> {
  const appUrl = process.env.APP_URL;
  const { InlineKeyboard } = await import("grammy");
  const keyboard = new InlineKeyboard();
  if (appUrl) keyboard.webApp("Открыть МЕСТО", appUrl).row();
  keyboard.text("Отключить напоминания", "disable_morning_reminders");

  await getBot().api.sendMessage(telegramId, text, { reply_markup: keyboard });
}
