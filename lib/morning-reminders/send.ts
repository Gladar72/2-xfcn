import { GrammyError } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { pickNextMessage, type ReminderHistoryEntry } from "@/lib/morning-reminders/pick-message";

// Сколько времени после запланированного момента ещё можно отправить
// сообщение — но не позже конца утреннего окна пользователя, чтобы не
// "переносить на ночь" (см. ТЗ). 60 минут: при десятках тысяч
// пользователей в одном часовом поясе рассылка "на 8:00" физически
// занимает ~30–40 минут (лимит Telegram), и ей нужен этот запас.
const LATE_SEND_GRACE_MINUTES = 60;

// Telegram разрешает боту ~30 сообщений в секунду суммарно — держим 25,
// чтобы не ловить 429 (Too Many Requests).
const MESSAGES_PER_SECOND = 25;
// Сколько строк забираем из базы за один заход. Не больше ~100: списки
// id уходят в URL запроса (.in("id", [...])), а слишком длинный URL
// отвергается шлюзом.
const FETCH_CHUNK = 100;
// Бюджет времени одного запуска cron. Функция запускается раз в 5 минут
// (vercel.json) с maxDuration 300с — оставляем запас, чтобы запуски не
// накладывались и не превышали общий лимит скорости Telegram.
const TIME_BUDGET_MS = 270_000;

type Admin = ReturnType<typeof createAdminClient>;

interface DueReminder {
  id: string;
  user_id: string;
  scheduled_at: string;
}

interface ReminderUser {
  id: string;
  telegram_id: number;
  morning_reminders_enabled: boolean;
  moderation_status: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Отправляет все "созревшие" (scheduled_at <= сейчас) напоминания со
 * статусом pending — пачками по ~25 в секунду, пока не кончатся или не
 * выйдет бюджет времени запуска. Раньше за один запуск уходило не больше
 * 200 сообщений раз в 10 минут (~1200 в час) — на десятки тысяч
 * пользователей рассылка "на 8:00" растянулась бы на сутки, а всё, что
 * опоздало больше чем на 30 минут, просто отменялось.
 *
 * Защита от дублей при нескольких экземплярах/повторных запусках —
 * атомарный захват строк (UPDATE ... WHERE status='pending' RETURNING):
 * строки, которые уже забрал другой процесс, просто не вернутся.
 */
export async function sendDueMorningReminders(admin: Admin): Promise<{ sent: number; skipped: number }> {
  const startedAt = Date.now();
  let sent = 0;
  let skipped = 0;
  // Строки, которые этот запуск уже пробовал (например, временная ошибка
  // вернула их в pending) — второй раз в тот же запуск не берём, иначе
  // цикл крутился бы на одних и тех же строках до конца бюджета.
  const attempted = new Set<string>();

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const now = new Date();
    const { data: due } = await admin
      .from("morning_reminders")
      .select("id, user_id, scheduled_at")
      .eq("status", "pending")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(FETCH_CHUNK);

    const fresh = ((due ?? []) as DueReminder[]).filter((r) => !attempted.has(r.id));
    if (fresh.length === 0) break;
    for (const r of fresh) attempted.add(r.id);

    // Пропущенные сообщения не шлём пачкой посреди дня — слишком
    // опоздавшие слоты сразу отменяем одним запросом.
    const tooLate = fresh.filter(
      (r) => (now.getTime() - new Date(r.scheduled_at).getTime()) / 60000 > LATE_SEND_GRACE_MINUTES
    );
    if (tooLate.length > 0) {
      await admin
        .from("morning_reminders")
        .update({ status: "cancelled" })
        .in(
          "id",
          tooLate.map((r) => r.id)
        )
        .eq("status", "pending");
      skipped += tooLate.length;
    }
    const tooLateIds = new Set(tooLate.map((r) => r.id));
    const candidates = fresh.filter((r) => !tooLateIds.has(r.id));
    if (candidates.length === 0) continue;

    // Пользователи — одним запросом на всю пачку, а не по одному.
    const userIds = Array.from(new Set(candidates.map((r) => r.user_id)));
    const { data: users } = await admin
      .from("users")
      .select("id, telegram_id, morning_reminders_enabled, moderation_status")
      .in("id", userIds);
    const userById = new Map(((users ?? []) as ReminderUser[]).map((u) => [u.id, u]));

    const disabled = candidates.filter((r) => {
      const u = userById.get(r.user_id);
      return !u || !u.morning_reminders_enabled || u.moderation_status !== "active";
    });
    if (disabled.length > 0) {
      await admin
        .from("morning_reminders")
        .update({ status: "skipped_disabled" })
        .in(
          "id",
          disabled.map((r) => r.id)
        )
        .eq("status", "pending");
      skipped += disabled.length;
    }
    const disabledIds = new Set(disabled.map((r) => r.id));
    const toSend = candidates.filter((r) => !disabledIds.has(r.id));
    if (toSend.length === 0) continue;

    // Атомарный захват всей пачки — что вернулось, то наше.
    const { data: claimed } = await admin
      .from("morning_reminders")
      .update({ status: "sending" })
      .in(
        "id",
        toSend.map((r) => r.id)
      )
      .eq("status", "pending")
      .select("id, user_id");
    const claimedRows = (claimed ?? []) as Array<{ id: string; user_id: string }>;
    if (claimedRows.length === 0) continue;

    // Отправка порциями по MESSAGES_PER_SECOND с паузой до конца секунды.
    for (let i = 0; i < claimedRows.length; i += MESSAGES_PER_SECOND) {
      const tickStart = Date.now();
      const slice = claimedRows.slice(i, i + MESSAGES_PER_SECOND);

      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        // Время вышло — возвращаем незабранное в pending для следующего запуска.
        await admin
          .from("morning_reminders")
          .update({ status: "pending" })
          .in(
            "id",
            claimedRows.slice(i).map((r) => r.id)
          )
          .eq("status", "sending");
        return { sent, skipped };
      }

      const results = await Promise.all(
        slice.map(async (row) => {
          const user = userById.get(row.user_id);
          if (!user) return "skipped" as const;
          return sendOne(admin, row.id, user);
        })
      );
      for (const r of results) {
        if (r === "sent") sent++;
        else skipped++;
      }

      const elapsed = Date.now() - tickStart;
      if (elapsed < 1000) await sleep(1000 - elapsed);
    }
  }

  return { sent, skipped };
}

async function sendOne(admin: Admin, reminderId: string, user: ReminderUser): Promise<"sent" | "skipped"> {
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
      .eq("id", reminderId);
    return "sent";
  } catch (err) {
    const blocked = err instanceof GrammyError && err.error_code === 403;
    if (blocked) {
      // Заблокировал бота или удалил аккаунт — прекращаем попытки насовсем.
      await admin.from("users").update({ morning_reminders_enabled: false }).eq("id", user.id);
      await admin.from("morning_reminders").update({ status: "failed" }).eq("id", reminderId);
    } else {
      // Временная ошибка (в т.ч. 429) — вернём в pending, следующий запуск
      // повторит (не бесконечно — см. LATE_SEND_GRACE_MINUTES).
      console.error(`sendDueMorningReminders — временная ошибка отправки (${reminderId}):`, err);
      await admin.from("morning_reminders").update({ status: "pending" }).eq("id", reminderId);
    }
    return "skipped";
  }
}

async function sendReminderMessage(telegramId: number, text: string): Promise<void> {
  const appUrl = process.env.APP_URL;
  const { InlineKeyboard } = await import("grammy");
  const keyboard = new InlineKeyboard();
  if (appUrl) keyboard.webApp("Открыть МЕСТО", appUrl);

  await getBot().api.sendMessage(telegramId, text, appUrl ? { reply_markup: keyboard } : undefined);
}
