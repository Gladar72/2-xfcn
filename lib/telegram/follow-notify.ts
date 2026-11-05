import { InlineKeyboard } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { buildEventCard } from "@/lib/telegram/event-card";
import { sendPushToUsers } from "@/lib/push/expo";
import { shortTitle } from "@/lib/notify/user";
import { sendInBatches } from "@/lib/server/background";
import { photoInput } from "@/lib/telegram/photo-input";

type Admin = ReturnType<typeof createAdminClient>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Новое событие организатора — его подписчикам: в Telegram карточка с фото и
 * кнопкой «Открыть», в приложение — push. Анонимные встречи не рассылаем:
 * «новое от такого-то» раскрыло бы организатора. Тех, кто в блокировке с ним, пропускаем.
 * Запускать без await — рассылка не должна задерживать ответ «встреча создана».
 */
export async function notifyFollowers(
  admin: Admin,
  params: { eventId: string; organizerId: string; title: string; isBusiness: boolean; isAnonymous: boolean }
): Promise<void> {
  if (params.isAnonymous) return;
  const [{ data: rows }, { data: org }, { data: blocks }] = await Promise.all([
    admin.from("follows").select("follower_id").eq("organizer_id", params.organizerId),
    admin.from("users").select("name").eq("id", params.organizerId).maybeSingle(),
    admin.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${params.organizerId},blocked_id.eq.${params.organizerId}`),
  ]);
  const blocked = new Set((blocks ?? []).map((b) => (b.blocker_id === params.organizerId ? b.blocked_id : b.blocker_id)));
  const ids = (rows ?? []).map((r) => r.follower_id as string).filter((id) => !blocked.has(id));
  if (ids.length === 0) return;
  const name = (org?.name as string | undefined)?.trim() || "Организатор";

  await sendPushToUsers(admin, ids, {
    title: `${name}: ${params.isBusiness ? "новое событие" : "новая встреча"}`,
    body: shortTitle(params.title, 100) || "Загляни — ты подписан(а) на этого организатора",
    data: { url: `/event/${params.eventId}`, type: "follow_event", eventId: params.eventId },
  }).catch((err) => console.error("follow push:", err));

  const { data: users } = await admin.from("users").select("telegram_id").in("id", ids);
  const telegramIds = (users ?? []).map((u) => u.telegram_id as number | null).filter((id): id is number => !!id);
  if (telegramIds.length === 0) return;

  const card = await buildEventCard(admin, params.eventId);
  if (!card.ok) return;
  const appUrl = process.env.APP_URL ?? "";
  const text = `🔔 <b>${esc(name)}</b> — ${params.isBusiness ? "новое событие" : "новая встреча"}\n\n${card.text}`;
  const kb = new InlineKeyboard();
  if (appUrl) kb.webApp("🙌 Открыть", `${appUrl}?goto=event_${params.eventId}`);

  let photoUrl: string | null = card.photoUrl ? (card.photoUrl.startsWith("/") ? `${appUrl}${card.photoUrl}` : card.photoUrl) : null;
  if (photoUrl && !/^https?:\/\//.test(photoUrl)) photoUrl = null;
  let photo: Awaited<ReturnType<typeof photoInput>> | null = photoUrl ? await photoInput(photoUrl) : null;
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
      console.error(`follow photo ${telegramId}:`, err);
      if (!String(err).includes("blocked") && !String(err).includes("chat not found")) photo = null;
      else return;
    }
    try {
      await api.sendMessage(telegramId, text, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
    } catch (err) {
      console.error(`follow text ${telegramId}:`, err);
    }
  };
  await sendOne(telegramIds[0]!);
  await sendInBatches(telegramIds.slice(1), sendOne);
}
