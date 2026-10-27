import { InlineKeyboard } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { buildEventCard } from "@/lib/telegram/event-card";
import { sendPushToUsers } from "@/lib/push/expo";
import { shortTitle } from "@/lib/notify/user";
import { sendInBatches } from "@/lib/server/background";

type Admin = ReturnType<typeof createAdminClient>;

/** callback-кнопка «🔕 Не присылать анонсы» под анонсом (обработчик — lib/telegram/bot.ts). */
export const ANNOUNCE_OFF = "ann_off";

/**
 * Анонс новой встречи (и обычной, и бизнес-события) всем в городе организатора:
 * в Telegram — карточка с фото, описанием и кнопкой «Открыть встречу»,
 * в мобильное приложение — push. Кроме самого организатора, тех, с кем он
 * в блокировке, и тех, кто нажал «Не присылать анонсы».
 *
 * Запускать без await: на своём сервере процесс живёт, а рассылка по городу
 * (25 сообщений в секунду) не должна задерживать ответ «встреча создана».
 */
export async function announceNewEvent(
  admin: Admin,
  params: { eventId: string; organizerId: string; city: string; title: string; isBusiness: boolean }
): Promise<void> {
  if (!params.city) return;

  const [{ data: users }, { data: blocks }] = await Promise.all([
    admin
      .from("users")
      .select("id, telegram_id")
      .eq("city", params.city)
      .neq("id", params.organizerId)
      .eq("event_announcements", true),
    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${params.organizerId},blocked_id.eq.${params.organizerId}`),
  ]);
  const blocked = new Set((blocks ?? []).map((b) => (b.blocker_id === params.organizerId ? b.blocked_id : b.blocker_id)));
  const recipients = (users ?? []).filter((u) => !blocked.has(u.id));
  if (recipients.length === 0) return;

  // Push в приложение — тем же людям.
  await sendPushToUsers(
    admin,
    recipients.map((u) => u.id as string),
    {
      title: params.isBusiness ? "Новое событие в городе" : "Новая встреча в городе",
      body: shortTitle(params.title, 100) || "Загляни — вдруг тебе подойдёт",
      data: { url: `/event/${params.eventId}`, type: params.isBusiness ? "business_event" : "event_created", eventId: params.eventId },
    }
  ).catch((err) => console.error("announce push:", err));

  const telegramIds = recipients.map((u) => u.telegram_id as number | null).filter((id): id is number => !!id);
  if (telegramIds.length === 0) return;

  const card = await buildEventCard(admin, params.eventId);
  if (!card.ok) return;
  const appUrl = process.env.APP_URL ?? "";
  const head = params.isBusiness ? "🆕 <b>Новое событие в твоём городе</b>" : "🆕 <b>Новая встреча в твоём городе</b>";
  const text = `${head}\n\n${card.text}`;
  const kb = new InlineKeyboard();
  if (appUrl) kb.webApp("🙌 Открыть встречу", `${appUrl}?goto=event_${params.eventId}`).row();
  kb.text("🔕 Не присылать анонсы", ANNOUNCE_OFF);

  // Фото: обложки-пресеты лежат на сайте (относительный путь) — делаем ссылку полной.
  // После первой отправки шлём уже file_id Telegram, чтобы он не качал фото заново.
  let photo: string | null = card.photoUrl ? (card.photoUrl.startsWith("/") ? `${appUrl}${card.photoUrl}` : card.photoUrl) : null;
  if (photo && !/^https?:\/\//.test(photo)) photo = null;
  const canCaption = text.length <= 1024;

  const api = getBot().api;
  const sendOne = async (telegramId: number) => {
    try {
      if (photo && canCaption) {
        const m = await api.sendPhoto(telegramId, photo, { caption: text, parse_mode: "HTML", reply_markup: kb });
        const fileId = m.photo?.[m.photo.length - 1]?.file_id;
        if (fileId) photo = fileId;
        return;
      }
    } catch (err) {
      console.error(`announce photo ${telegramId}:`, err);
      if (!String(err).includes("blocked") && !String(err).includes("chat not found")) photo = null;
      else return;
    }
    try {
      await api.sendMessage(telegramId, text, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
    } catch (err) {
      console.error(`announce text ${telegramId}:`, err);
    }
  };

  // Первое сообщение — отдельно, чтобы получить file_id фото для остальных.
  await sendOne(telegramIds[0]!);
  await sendInBatches(telegramIds.slice(1), sendOne);
}
