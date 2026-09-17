import type { createAdminClient } from "@/lib/supabase/admin";
import { getCityUtcOffset } from "@/lib/data/city-timezones";

const MIN_GAP_DAYS = 2; // "не менее 48 часов между сообщениями" — в календарных днях между датами
const MIN_HOURS_AFTER_SIGNUP = 48;
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 11;

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

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Случайно выбирает до targetCount дат из candidates так, чтобы между любыми двумя было не меньше MIN_GAP_DAYS. */
function pickSpacedDays(candidates: Date[], targetCount: number): Date[] {
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const chosen: Date[] = [];
  for (const date of shuffled) {
    if (chosen.every((c) => daysBetween(c, date) >= MIN_GAP_DAYS)) {
      chosen.push(date);
      if (chosen.length >= targetCount) break;
    }
  }
  return chosen.sort((a, b) => a.getTime() - b.getTime());
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
    const eligibleDays = remainingDays.filter((d) => addDays(d, 1).getTime() > signupCutoff.getTime());
    if (eligibleDays.length === 0) continue; // слишком свежая регистрация — подождём следующей недели

    const targetCount = Math.min(eligibleDays.length, Math.random() < 0.5 ? 2 : 3);
    const chosenDays = pickSpacedDays(eligibleDays, targetCount);
    if (chosenDays.length === 0) continue;

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
