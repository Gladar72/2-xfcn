mkdir -p "lib/morning-reminders"
cat > "lib/morning-reminders/schedule.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";
import { getCityUtcOffset } from "@/lib/data/city-timezones";

const MIN_HOURS_AFTER_SIGNUP = 48;
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 11;

// "Через день" всем одинаково — фиксированная точка отсчёта, а не
// индивидуально для каждого пользователя: чётность номера календарного
// дня от этой даты решает, отправлять сегодня или нет. Так пропуск дня
// сохраняется и на границе недель (раньше планирование шло по неделям
// отдельно, и случайный выбор 2-3 дней внутри недели мог случайно дать
// два дня подряд на стыке недель).
const REFERENCE_EPOCH = Date.UTC(2026, 0, 1);

function isSendDay(date: Date): boolean {
  const dayIndex = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - REFERENCE_EPOCH) / (24 * 60 * 60 * 1000)
  );
  return dayIndex % 2 === 0;
}

/** Понедельник ISO-недели, которой принадлежит дата (в UTC-календарных сутках). */
function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // воскресенье = 0 → 7, чтобы неделя начиналась с понедельника
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Планирует утренние напоминания на текущую неделю для пользователей, у
 * которых ещё нет ни одной запланированной записи на эту неделю —
 * идемпотентно: повторный запуск в течение той же недели ничего не
 * задваивает (проверяем существование по week_start, а сама вставка
 * дополнительно защищена уникальным индексом в БД).
 *
 * Специально НЕ планирует "наперёд" будущие недели — только текущую,
 * от сегодняшнего дня до воскресенья. Так проще: не нужно ничего отменять
 * при отключении напоминаний или смене города/часового пояса, а
 * следующая неделя просто получит свежее расписание при следующем запуске.
 */
export async function scheduleCurrentWeekReminders(admin: ReturnType<typeof createAdminClient>): Promise<{
  scheduledUsers: number;
  scheduledSlots: number;
}> {
  const now = new Date();
  const weekStart = isoWeekStart(now);
  const weekStartIso = weekStart.toISOString().slice(0, 10);

  // Дни этой недели, которые ещё не прошли (сегодня включительно) — на
  // случай, если фича включена/пользователь зарегистрирован в середине
  // недели, планируем только оставшиеся дни.
  const remainingDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    if (day.getTime() >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()) {
      remainingDays.push(day);
    }
  }
  if (remainingDays.length === 0) return { scheduledUsers: 0, scheduledSlots: 0 };

  // Пользователи, у которых уже ЕСТЬ расписание на эту неделю — пропускаем
  // целиком (идемпотентность при повторном запуске).
  const { data: alreadyScheduled } = await admin
    .from("morning_reminders")
    .select("user_id")
    .eq("week_start", weekStartIso);
  const alreadyScheduledIds = new Set((alreadyScheduled ?? []).map((r) => r.user_id));

  const { data: candidates } = await admin
    .from("users")
    .select("id, city, created_at")
    .eq("morning_reminders_enabled", true)
    .eq("moderation_status", "active");

  if (!candidates) return { scheduledUsers: 0, scheduledSlots: 0 };

  const rowsToInsert: {
    user_id: string;
    week_start: string;
    slot_index: number;
    scheduled_at: string;
    status: string;
  }[] = [];

  let scheduledUsers = 0;

  for (const user of candidates) {
    if (alreadyScheduledIds.has(user.id)) continue;

    const signupCutoff = new Date(new Date(user.created_at).getTime() + MIN_HOURS_AFTER_SIGNUP * 60 * 60 * 1000);
    // "Через день" всем одинаково (см. isSendDay) — берём КАЖДЫЙ такой
    // день из оставшихся дней недели, без случайного выбора подмножества.
    const chosenDays = remainingDays.filter((d) => addDays(d, 1).getTime() > signupCutoff.getTime() && isSendDay(d));
    if (chosenDays.length === 0) continue; // слишком свежая регистрация — подождём следующей недели

    const offsetHours = getCityUtcOffset(user.city);

    chosenDays.forEach((day, slotIndex) => {
      const randomMinuteOfWindow = Math.floor(Math.random() * (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60);
      const localHour = WINDOW_START_HOUR + Math.floor(randomMinuteOfWindow / 60);
      const localMinute = randomMinuteOfWindow % 60;
      // День+время указаны в местном времени пользователя — переводим в UTC
      // вычитанием смещения (местное = UTC + offset ⇒ UTC = местное - offset).
      const scheduledUtc = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), localHour - offsetHours, localMinute)
      );
      // Не планируем момент, который уже прошёл (например, сегодняшний
      // день, а случайное время внутри окна уже позади) — такой слот
      // никогда не будет отправлен, и в этом нет ничего страшного, но
      // корректнее просто пропустить его, чем создавать заведомо мёртвую запись.
      if (scheduledUtc.getTime() <= now.getTime()) return;

      rowsToInsert.push({
        user_id: user.id,
        week_start: weekStartIso,
        slot_index: slotIndex,
        scheduled_at: scheduledUtc.toISOString(),
        status: "pending",
      });
    });

    scheduledUsers++;
  }

  if (rowsToInsert.length > 0) {
    // upsert с ignoreDuplicates — если строка для (user_id, week_start,
    // slot_index) уже существует (например, из-за гонки параллельных
    // запусков cron), просто пропускаем её вместо ошибки.
    await admin.from("morning_reminders").upsert(rowsToInsert, {
      onConflict: "user_id,week_start,slot_index",
      ignoreDuplicates: true,
    });
  }

  return { scheduledUsers, scheduledSlots: rowsToInsert.length };
}
ENDOFFILE

mkdir -p "lib/morning-reminders"
cat > "lib/morning-reminders/send.ts" << 'ENDOFFILE'
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
ENDOFFILE

