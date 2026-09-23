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

  // Раньше проверялось "есть ли у пользователя ХОТЬ ОДНА запись на эту
  // неделю" — и если да, пропускался целиком до следующей недели. Из-за
  // этого, когда логика планирования менялась в середине недели (напр.
  // переход на "через день"), у пользователей с уже существующей старой
  // записью на эту неделю новые дни просто не досоздавались. Теперь
  // проверяем по конкретным ДНЯМ (slot_index = смещение дня от начала
  // недели, 0=понедельник) — так система сама "доберёт" недостающие дни,
  // что бы ни изменилось в логике планирования.
  const { data: alreadyScheduled } = await admin
    .from("morning_reminders")
    .select("user_id, slot_index")
    .eq("week_start", weekStartIso);
  const alreadyScheduledSlotsByUser = new Map<string, Set<number>>();
  for (const row of alreadyScheduled ?? []) {
    if (!alreadyScheduledSlotsByUser.has(row.user_id)) {
      alreadyScheduledSlotsByUser.set(row.user_id, new Set());
    }
    alreadyScheduledSlotsByUser.get(row.user_id)!.add(row.slot_index);
  }

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
    const signupCutoff = new Date(new Date(user.created_at).getTime() + MIN_HOURS_AFTER_SIGNUP * 60 * 60 * 1000);
    const existingSlots = alreadyScheduledSlotsByUser.get(user.id) ?? new Set<number>();
    // "Через день" всем одинаково (см. isSendDay) — берём КАЖДЫЙ такой
    // день из оставшихся дней недели, без случайного выбора подмножества,
    // и без тех дней, на которые запись уже есть (см. слот выше).
    const chosenDays = remainingDays.filter(
      (d) =>
        addDays(d, 1).getTime() > signupCutoff.getTime() &&
        isSendDay(d) &&
        !existingSlots.has(Math.round((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)))
    );
    if (chosenDays.length === 0) continue; // ничего нового на эту неделю — либо всё уже создано, либо слишком свежая регистрация

    const offsetHours = getCityUtcOffset(user.city);

    chosenDays.forEach((day) => {
      // slot_index = смещение дня от понедельника этой недели (0..6) —
      // стабильный и однозначный номер, а не просто порядок среди
      // выбранных дней (важно для проверки выше при повторных запусках).
      const slotIndex = Math.round((day.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
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

mkdir -p "supabase/migrations"
cat > "supabase/migrations/0031_morning_reminders_sending_status.sql" << 'ENDOFFILE'
-- 0031_morning_reminders_sending_status.sql
--
-- НАСТОЯЩАЯ причина, почему утренние напоминания никогда не
-- отправлялись: код атомарно "захватывает" строку перед отправкой,
-- временно проставляя status='sending' (чтобы не отправить дважды при
-- параллельном/повторном запуске cron) — но 'sending' отсутствовал в
-- CHECK-ограничении статуса, и база отвергала это обновление с ошибкой
-- 400. Код не проверял ошибку и просто трактовал это как "строку уже
-- забрал другой процесс", пропуская КАЖДОЕ напоминание без исключения.

alter table morning_reminders drop constraint morning_reminders_status_check;

alter table morning_reminders add constraint morning_reminders_status_check
  check (status in ('pending', 'sending', 'sent', 'skipped_active', 'skipped_disabled', 'failed', 'cancelled'));
ENDOFFILE

