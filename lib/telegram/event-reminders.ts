import { InlineKeyboard, type Api } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CITY_UTC_OFFSET } from "@/lib/data/city-timezones";
import { estimateRussiaUtcOffsetHours } from "@/lib/reviews/timezone";

/**
 * Напоминание за 2 часа до встречи с подтверждением «Иду / Не смогу».
 *
 *   * За 2 часа до начала — участникам сообщение с кнопками «✅ Иду» /
 *     «❌ Не смогу», организатору — просто напоминание о его встрече.
 *   * Участник не ответил — за час до начала ещё одно напоминание (один раз).
 *   * «Не смогу» — участник убирается из встречи и чата, место снова
 *     свободно, организатору приходит сообщение (см. handleRsvpAnswer).
 *
 * Вызывается из cron раз в 5 минут (app/api/cron/event-reminders).
 * Защита от дублей — уникальная строка event_rsvps на (встреча, человек):
 * сообщение уходит только тому, чью строку удалось вставить именно сейчас.
 */

type Admin = ReturnType<typeof createAdminClient>;

const FIRST_REMINDER_MINUTES = 120;
const SECOND_REMINDER_MINUTES = 60;
// Если человека приняли во встречу совсем незадолго до начала — не
// дёргаем его «напоминанием» за 5 минут до старта.
const MIN_MINUTES_BEFORE_START = 10;
// Второе напоминание — не раньше, чем через 30 минут после первого
// (если встречу создали за час до начала, двух сообщений подряд не будет).
const MIN_GAP_BETWEEN_REMINDERS_MS = 30 * 60 * 1000;
const SEND_DELAY_MS = 40; // ~25 сообщений в секунду — лимит Telegram

interface EventRow {
  id: string;
  title: string;
  city: string | null;
  place_name: string | null;
  address: string | null;
  event_date: string;
  event_time: string;
  longitude: number | null;
  organizer_id: string;
}

interface MemberUser {
  id: string;
  telegram_id: number;
  name: string;
}

/** Начало встречи в UTC: время хранится «как ввёл организатор» — по местному времени города. */
function eventStartUtc(event: EventRow): Date {
  const offsetHours =
    (event.city ? CITY_UTC_OFFSET[event.city] : undefined) ?? estimateRussiaUtcOffsetHours(event.longitude);
  const naiveAsUtc = new Date(`${event.event_date}T${event.event_time}Z`);
  return new Date(naiveAsUtc.getTime() - offsetHours * 60 * 60 * 1000);
}

function inHowLong(minutes: number): string {
  if (minutes >= 105) return "через 2 часа";
  if (minutes >= 75) return "через полтора часа";
  if (minutes >= 50) return "через час";
  return `через ${Math.max(1, Math.round(minutes / 5) * 5)} мин`;
}

function placeLine(event: EventRow): string {
  const address = event.address?.replace(/^Россия,\s*/, "") ?? null;
  const parts = [event.place_name, address].filter(Boolean);
  return parts.length ? `📍 ${parts.join(", ")}\n` : "";
}

function eventUrl(eventId: string): string | null {
  const appUrl = process.env.APP_URL;
  return appUrl ? `${appUrl}?goto=event_${eventId}` : null;
}

function participantKeyboard(rsvpId: string, eventId: string): InlineKeyboard {
  const kb = new InlineKeyboard().text("✅ Иду", `rsvp:y:${rsvpId}`).text("❌ Не смогу", `rsvp:n:${rsvpId}`);
  const url = eventUrl(eventId);
  if (url) kb.row().webApp("Открыть встречу", url);
  return kb;
}

function organizerKeyboard(eventId: string): InlineKeyboard | undefined {
  const url = eventUrl(eventId);
  return url ? new InlineKeyboard().webApp("Открыть встречу", url) : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendDueEventReminders(
  admin: Admin,
  api: Api
): Promise<{ first: number; second: number }> {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  // Грубый фильтр по дате (с запасом на часовые пояса), точный — ниже.
  const fromDate = new Date(now.getTime() - day).toISOString().slice(0, 10);
  const toDate = new Date(now.getTime() + day).toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, city, place_name, address, event_date, event_time, longitude, organizer_id")
    .in("status", ["published", "closed"])
    .gte("event_date", fromDate)
    .lte("event_date", toDate);

  const due = ((candidates ?? []) as EventRow[])
    .map((event) => ({ event, minutesLeft: (eventStartUtc(event).getTime() - now.getTime()) / 60000 }))
    .filter(({ minutesLeft }) => minutesLeft > MIN_MINUTES_BEFORE_START && minutesLeft <= FIRST_REMINDER_MINUTES);

  if (due.length === 0) return { first: 0, second: 0 };

  const eventIds = due.map((d) => d.event.id);
  const [{ data: memberRows }, { data: existingRows }] = await Promise.all([
    admin
      .from("event_members")
      .select("event_id, role, ticket_code, user:users(id, telegram_id, name)")
      .in("event_id", eventIds),
    admin
      .from("event_rsvps")
      .select("id, event_id, user_id, role, status, reminder_count, last_sent_at")
      .in("event_id", eventIds),
  ]);

  const existingKeys = new Set((existingRows ?? []).map((r) => `${r.event_id}:${r.user_id}`));
  let first = 0;
  let second = 0;

  for (const { event, minutesLeft } of due) {
    const members = (memberRows ?? [])
      .filter((m) => m.event_id === event.id)
      .map((m) => ({
        role: m.role as "organizer" | "participant",
        ticketCode: (m.ticket_code as string | null) ?? null,
        user: m.user as unknown as MemberUser | null,
      }))
      .filter(
        (m): m is { role: "organizer" | "participant"; ticketCode: string | null; user: MemberUser } => !!m.user
      );

    const participantsCount = members.filter((m) => m.role === "participant").length;

    // ── Первое напоминание: всем, кому ещё не писали ──
    const fresh = members.filter((m) => !existingKeys.has(`${event.id}:${m.user.id}`));
    // Организатору без участников напоминать о «встрече» не о чем — пропускаем.
    const toInsert = fresh
      .filter((m) => m.role === "participant" || participantsCount > 0)
      .map((m) => ({
        event_id: event.id,
        user_id: m.user.id,
        role: m.role,
        // Организатору подтверждать нечего — сразу «идёт», повторов не будет.
        status: m.role === "organizer" ? "going" : "sent",
      }));

    if (toInsert.length > 0) {
      // ignoreDuplicates → вернутся только реально вставленные строки: если
      // параллельный запуск уже вставил строку, этот запуск её не отправит.
      const { data: inserted } = await admin
        .from("event_rsvps")
        .upsert(toInsert, { onConflict: "event_id,user_id", ignoreDuplicates: true })
        .select("id, user_id, role");

      // Та же новость — карточкой «Встречаемся через 2 часа» в разделе
      // «Уведомления» приложения (с билетом и кнопкой чата).
      if (inserted && inserted.length > 0) {
        await admin
          .from("notifications")
          .insert(inserted.map((row) => ({ user_id: row.user_id, type: "event_soon", payload: { eventId: event.id } })));
      }

      for (const row of inserted ?? []) {
        const member = members.find((m) => m.user.id === row.user_id);
        if (!member) continue;
        const when = inHowLong(minutesLeft);
        const time = event.event_time.slice(0, 5);
        try {
          if (row.role === "organizer") {
            await api.sendMessage(
              member.user.telegram_id,
              `⏰ ${when[0]?.toUpperCase()}${when.slice(1)} ваша встреча «${event.title}» — в ${time}.\n` +
                placeLine(event) +
                `\nУчастникам я отправил напоминание. Если кто-то не сможет прийти — сразу сообщу.`,
              { reply_markup: organizerKeyboard(event.id) }
            );
          } else {
            await api.sendMessage(
              member.user.telegram_id,
              `⏰ ${when[0]?.toUpperCase()}${when.slice(1)} встреча «${event.title}» — в ${time}.\n` +
                placeLine(event) +
                (member.ticketCode ? `\n🎟 Твой билет: ${member.ticketCode} — назови номер организатору на входе.` : "") +
                `\nПодтверди, пожалуйста: ты идёшь?`,
              { reply_markup: participantKeyboard(row.id, event.id) }
            );
          }
          first++;
        } catch (err) {
          console.error("event reminder: не удалось отправить", member.user.telegram_id, err);
        }
        await sleep(SEND_DELAY_MS);
      }
    }

    // ── Второе напоминание за час: участник так и не ответил ──
    if (minutesLeft <= SECOND_REMINDER_MINUTES) {
      const waiting = (existingRows ?? []).filter(
        (r) =>
          r.event_id === event.id &&
          r.role === "participant" &&
          r.status === "sent" &&
          r.reminder_count === 1 &&
          now.getTime() - new Date(r.last_sent_at).getTime() >= MIN_GAP_BETWEEN_REMINDERS_MS
      );
      for (const r of waiting) {
        const member = members.find((m) => m.user.id === r.user_id);
        if (!member) continue; // уже не участник
        // Захват строки: второе напоминание уйдёт только из одного запуска.
        const { data: claimed } = await admin
          .from("event_rsvps")
          .update({ reminder_count: 2, last_sent_at: now.toISOString() })
          .eq("id", r.id)
          .eq("reminder_count", 1)
          .eq("status", "sent")
          .select("id");
        if (!claimed || claimed.length === 0) continue;
        try {
          await api.sendMessage(
            member.user.telegram_id,
            `⏰ Встреча «${event.title}» уже ${inHowLong(minutesLeft)}, в ${event.event_time.slice(0, 5)}.\n` +
              placeLine(event) +
              `\nТы так и не ответил(а) — идёшь? Организатору важно знать.`,
            { reply_markup: participantKeyboard(r.id, event.id) }
          );
          second++;
        } catch (err) {
          console.error("event reminder (2): не удалось отправить", member.user.telegram_id, err);
        }
        await sleep(SEND_DELAY_MS);
      }
    }
  }

  return { first, second };
}

export type RsvpAnswerResult =
  | { ok: true; answer: "going" | "not_going"; text: string }
  | { ok: false; text: string };

/**
 * Ответ на кнопку «✅ Иду» / «❌ Не смогу» под напоминанием.
 * «Не смогу» — человек убирается из встречи и её чата, место освобождается
 * (release_event_seat сам вернёт заполненную встречу в поиск), организатор
 * получает сообщение.
 */
export async function handleRsvpAnswer(
  admin: Admin,
  api: Api,
  params: { rsvpId: string; answer: "going" | "not_going"; fromTelegramId: number }
): Promise<RsvpAnswerResult> {
  const { data: rsvp } = await admin
    .from("event_rsvps")
    .select("id, event_id, user_id, role, status, user:users(telegram_id, name)")
    .eq("id", params.rsvpId)
    .maybeSingle();

  const rsvpUser = rsvp?.user as unknown as { telegram_id: number; name: string } | null;
  if (!rsvp || !rsvpUser || Number(rsvpUser.telegram_id) !== params.fromTelegramId) {
    return { ok: false, text: "Это напоминание уже неактуально." };
  }
  if (rsvp.status === "going" || rsvp.status === "not_going") {
    return {
      ok: false,
      text: rsvp.status === "going" ? "Ты уже подтвердил(а), что идёшь 👍" : "Ты уже ответил(а), что не сможешь.",
    };
  }

  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id")
    .eq("id", rsvp.event_id)
    .maybeSingle();
  if (!event) return { ok: false, text: "Встреча не найдена." };

  // Захват: ответ засчитывается один раз, даже если кнопку нажали дважды.
  const { data: updated } = await admin
    .from("event_rsvps")
    .update({ status: params.answer, responded_at: new Date().toISOString() })
    .eq("id", rsvp.id)
    .eq("status", "sent")
    .select("id");
  if (!updated || updated.length === 0) return { ok: false, text: "Ответ уже учтён." };

  if (params.answer === "going") {
    return { ok: true, answer: "going", text: "✅ Отлично, ждём тебя! Хорошей встречи 🧡" };
  }

  // «Не смогу» — убираем из встречи так же, как если бы организатор убрал сам.
  const { data: application } = await admin
    .from("applications")
    .select("id")
    .eq("event_id", event.id)
    .eq("user_id", rsvp.user_id)
    .eq("status", "accepted")
    .maybeSingle();

  const { data: removedMember } = await admin
    .from("event_members")
    .delete()
    .eq("event_id", event.id)
    .eq("user_id", rsvp.user_id)
    .eq("role", "participant")
    .select("id");

  if (removedMember && removedMember.length > 0) {
    if (application) await admin.from("applications").update({ status: "cancelled" }).eq("id", application.id);
    await admin.rpc("release_event_seat", { p_event_id: event.id });

    const { data: conversation } = await admin
      .from("conversations")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();
    if (conversation) {
      await admin
        .from("conversation_members")
        .delete()
        .eq("conversation_id", conversation.id)
        .eq("user_id", rsvp.user_id);
    }
  }

  const { data: organizer } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", event.organizer_id)
    .maybeSingle();
  const organizerTelegramId = organizer?.telegram_id as number | undefined;
  if (organizerTelegramId) {
    await api
      .sendMessage(
        Number(organizerTelegramId),
        `😔 ${rsvpUser.name} не сможет прийти на встречу «${event.title}». Место снова свободно — встреча видна в поиске.`,
        { reply_markup: organizerKeyboard(event.id) }
      )
      .catch((err) => console.error("rsvp: не удалось уведомить организатора", err));
  }

  return {
    ok: true,
    answer: "not_going",
    text: "Понял, спасибо, что предупредил(а)! Место освобождено — организатор в курсе.",
  };
}
