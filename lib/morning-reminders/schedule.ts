import type { createAdminClient } from "@/lib/supabase/admin";

const MIN_HOURS_AFTER_SIGNUP = 48;
// Одно время для всех: 10:00 по Тюмени (UTC+5) = 8:00 по Москве (UTC+3),
// т.е. 05:00 UTC — по явному запросу владельца.
const SEND_UTC_HOUR = 5;
const SEND_UTC_MINUTE = 0;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Через день: шлём только в "чётные" дни от 1970-01-01 (UTC). Считаем от
 * эпохи, а не от понедельника — в неделе 7 дней, и иначе чередование
 * сбивалось бы на стыке недель (вс → пн подряд).
 */
function isReminderDay(day: Date): boolean {
  return Math.round(day.getTime() / DAY_MS) % 2 === 0;
}
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 1000;

/** Читает все строки запроса постранично (PostgREST режет ответ до 1000 строк). */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
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
  // PostgREST отдаёт не больше 1000 строк за запрос — раньше при >1000
  // пользователей напоминания молча планировались только первой тысяче.
  // Теперь читаем постранично.
  const alreadyScheduled = await fetchAllPages<{ user_id: string; slot_index: number }>((from, to) =>
    admin
      .from("morning_reminders")
      .select("user_id, slot_index")
      .eq("week_start", weekStartIso)
      .order("id", { ascending: true })
      .range(from, to)
  );
  const alreadyScheduledSlotsByUser = new Map<string, Set<number>>();
  for (const row of alreadyScheduled) {
    if (!alreadyScheduledSlotsByUser.has(row.user_id)) {
      alreadyScheduledSlotsByUser.set(row.user_id, new Set());
    }
    alreadyScheduledSlotsByUser.get(row.user_id)!.add(row.slot_index);
  }

  const candidates = await fetchAllPages<{ id: string; city: string; created_at: string }>((from, to) =>
    admin
      .from("users")
      .select("id, city, created_at")
      .eq("morning_reminders_enabled", true)
      .eq("moderation_status", "active")
      .order("id", { ascending: true })
      .range(from, to)
  );

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
    // Всем зарегистрированным пользователям, ЧЕРЕЗ ДЕНЬ (см. isReminderDay)
    // — без тех дней, на которые запись уже есть.
    const chosenDays = remainingDays.filter(
      (d) =>
        isReminderDay(d) &&
        addDays(d, 1).getTime() > signupCutoff.getTime() &&
        !existingSlots.has(Math.round((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)))
    );
    if (chosenDays.length === 0) continue; // ничего нового на эту неделю — либо всё уже создано, либо слишком свежая регистрация

    chosenDays.forEach((day) => {
      // slot_index = смещение дня от понедельника этой недели (0..6) —
      // стабильный и однозначный номер, а не просто порядок среди
      // выбранных дней (важно для проверки выше при повторных запусках).
      const slotIndex = Math.round((day.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
      // Единое время для всех городов — 05:00 UTC (10:00 Тюмень / 8:00 Москва).
      const scheduledUtc = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), SEND_UTC_HOUR, SEND_UTC_MINUTE)
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
    // Порциями — одна огромная вставка на десятки тысяч строк упирается
    // в размер запроса и таймауты.
    for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK) {
      await admin.from("morning_reminders").upsert(rowsToInsert.slice(i, i + INSERT_CHUNK), {
        onConflict: "user_id,week_start,slot_index",
        ignoreDuplicates: true,
      });
    }
  }

  return { scheduledUsers, scheduledSlots: rowsToInsert.length };
}
