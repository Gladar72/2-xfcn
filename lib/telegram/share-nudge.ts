import { InlineKeyboard, type Api } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { eventTiming } from "@/lib/events/timing";
import { shareNudgeDue } from "@/lib/events/share-nudge";
import { eventShareLink } from "@/lib/telegram/event-card";
import { sendPushPersonal } from "@/lib/push/expo";
import { shortTitle } from "@/lib/notify/user";

/**
 * «Пока никто не откликнулся — поделись событием».
 *
 * Организатору опубликованной встречи, на которую нет ни участников, ни заявок:
 * за 10 часов до начала (или через 2 часа после создания, если создали позже) —
 * сообщение в боте с картинкой-сторис и кнопками «Переслать друзьям» / «Сторис» /
 * «Открыть событие», карточка в «Уведомлениях» и push в мобильное приложение.
 *
 * Один раз на событие: защита от повтора — строка notifications(type = share_nudge).
 * Вызывается из cron раз в 5 минут (app/api/cron/event-reminders).
 */
type Admin = ReturnType<typeof createAdminClient>;

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "Mesto_people_bot";
const SEND_DELAY_MS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Row {
  id: string;
  title: string;
  city: string | null;
  longitude: number | null;
  event_date: string;
  event_time: string;
  event_end_time: string | null;
  seats_taken: number;
  created_at: string;
  organizer_id: string;
  organizer: { telegram_id: number | null } | null;
}

export async function sendDueShareNudges(admin: Admin, api: Api): Promise<{ nudged: number }> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const fromDate = new Date(now - day).toISOString().slice(0, 10);
  const toDate = new Date(now + 2 * day).toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("events")
    .select(
      "id, title, city, longitude, event_date, event_time, event_end_time, seats_taken, created_at, organizer_id, organizer:users!events_organizer_id_fkey(telegram_id)"
    )
    .eq("status", "published")
    .eq("seats_taken", 0)
    .gte("event_date", fromDate)
    .lte("event_date", toDate);

  const due = ((candidates ?? []) as unknown as Row[]).filter((e) =>
    shareNudgeDue(eventTiming(e).start.getTime(), new Date(e.created_at).getTime(), now)
  );
  if (due.length === 0) return { nudged: 0 };

  const ids = due.map((e) => e.id);
  const [{ data: pending }, { data: sent }] = await Promise.all([
    admin.from("applications").select("event_id").in("event_id", ids).eq("status", "pending"),
    admin.from("notifications").select("payload").eq("type", "share_nudge").in("payload->>eventId", ids),
  ]);
  const hasPending = new Set((pending ?? []).map((a) => a.event_id as string));
  const alreadySent = new Set((sent ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId));

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  let nudged = 0;

  for (const e of due) {
    if (hasPending.has(e.id) || alreadySent.has(e.id)) continue;

    // Сначала строка-«замок» (она же карточка в «Уведомлениях»), потом сообщение.
    const { error } = await admin
      .from("notifications")
      .insert({ user_id: e.organizer_id, type: "share_nudge", payload: { eventId: e.id } });
    if (error) continue;
    nudged += 1;

    const tgId = e.organizer?.telegram_id;
    if (tgId) {
      const link = eventShareLink(BOT, e.id);
      const shareText = `${e.title} — пойдёшь со мной? 🙌`;
      const kb = new InlineKeyboard()
        .url("📤 Переслать друзьям", `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`);
      if (appUrl) {
        kb.webApp("📸 Сторис", `${appUrl}?goto=eventshare_${e.id}`).row().webApp("Открыть событие", `${appUrl}?goto=event_${e.id}`);
      }
      const time = e.event_time.slice(0, 5);
      const text =
        `🙈 «<b>${escapeHtml(e.title)}</b>» в ${time}, а откликов пока нет.\n\n` +
        "Поделись событием — так его увидят друзья и друзья друзей. Сторис для Instagram и Telegram Мося уже собрал 👇";
      try {
        if (appUrl) {
          await api.sendPhoto(tgId, `${appUrl}/api/events/${e.id}/story.png?v=${Date.now().toString(36)}`, { caption: text, parse_mode: "HTML", reply_markup: kb });
        } else {
          await api.sendMessage(tgId, text, { parse_mode: "HTML", reply_markup: kb });
        }
      } catch {
        // Картинка не загрузилась (или бот заблокирован) — пробуем просто текстом.
        await api.sendMessage(tgId, text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
      }
      await sleep(SEND_DELAY_MS);
    }

    await sendPushPersonal(admin, [
      {
        userId: e.organizer_id,
        message: {
          title: "🙈 Пока никто не откликнулся",
          body: `«${shortTitle(e.title)}» — поделись событием в сторис или в чате`,
          data: { url: `/event/${e.id}`, type: "share_nudge", eventId: e.id },
        },
      },
    ]).catch(() => {});
  }

  return { nudged };
}
