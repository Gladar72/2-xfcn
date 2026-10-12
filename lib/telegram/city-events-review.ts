import { InlineKeyboard, type Bot } from "grammy";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { syncCityCovers } from "@/lib/city-events";

/**
 * Модерация «Что ещё в городе» прямо в Telegram: бот присылает админу
 * найденное событие карточкой, «✅ В ленту» / «❌ Пропустить».
 */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function cityEventCardText(e: Record<string, unknown>): string {
  const d = new Date(`${e.event_date as string}T00:00:00`);
  const day = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
  const time = e.event_time ? `, ${String(e.event_time).slice(0, 5)}` : "";
  const until = e.end_date ? ` — до ${new Date(`${e.end_date as string}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : "";
  return [
    `🗓 <b>${esc(e.title as string)}</b>`,
    `${day}${time}${until}`,
    e.place_name || e.address ? `📍 ${esc([e.place_name, e.address].filter(Boolean).join(", ") as string)}` : null,
    e.price_text ? `💳 ${esc(e.price_text as string)}` : null,
    `Источник: ${esc(e.source as string)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function reviewKeyboard(id: string, url: string) {
  return new InlineKeyboard().text("✅ В ленту", `ce:ok:${id}`).text("❌ Пропустить", `ce:no:${id}`).row().url("Открыть источник", url);
}

export function registerCityEventReview(bot: Bot) {
  bot.callbackQuery(/^ce:(ok|no):([0-9a-f-]{36})$/, async (ctx) => {
    if (!isAdminTelegramId(ctx.from.id)) return ctx.answerCallbackQuery();
    const [, act, id] = ctx.match as RegExpMatchArray;
    const status = act === "ok" ? "approved" : "rejected";
    const { data } = await createAdminClient()
      .from("city_events")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id!)
      .select("title")
      .maybeSingle();
    await ctx.answerCallbackQuery({ text: status === "approved" ? "Добавил в ленту" : "Пропустил" });
    const msg = ctx.callbackQuery.message;
    const mark = status === "approved" ? "✅ В ленте" : "❌ Пропущено";
    if (msg && "photo" in msg && msg.photo) {
      await ctx.editMessageCaption({ caption: `${esc(msg.caption ?? data?.title ?? "")}\n\n${mark}`, parse_mode: "HTML" }).catch(() => {});
    } else {
      const base = msg && "text" in msg ? msg.text : data?.title ?? "";
      await ctx.editMessageText(`${esc(base ?? "")}\n\n${mark}`, { parse_mode: "HTML" }).catch(() => {});
    }
  });
}

/** Разослать админу ещё не показанные найденные события (раз в утро, из крона). */
export async function sendPendingCityEvents(api: Bot["api"], adminId: number): Promise<number> {
  const admin = createAdminClient();
  await syncCityCovers(admin).catch(() => 0);
  const { data } = await admin
    .from("city_events")
    .select("id, title, event_date, event_time, end_date, place_name, address, price_text, source, source_url, photo_url")
    .eq("status", "pending")
    .is("notified_at", null)
    .gte("event_date", new Date(Date.now() - 864e5).toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(25);
  const list = data ?? [];
  if (!list.length) return 0;
  await api.sendMessage(
    adminId,
    `🔎 Мося нашёл ${list.length} событий для «Что ещё в городе». Посмотри и отметь, что ставить в ленту 👇`
  );
  for (const e of list) {
    const markup = reviewKeyboard(e.id as string, e.source_url as string);
    const sent = e.photo_url
      ? api.sendPhoto(adminId, e.photo_url as string, { caption: cityEventCardText(e), parse_mode: "HTML", reply_markup: markup })
      : api.sendMessage(adminId, cityEventCardText(e), { parse_mode: "HTML", reply_markup: markup, link_preview_options: { is_disabled: true } });
    await sent.catch((err) => console.error("city event card failed:", err));
    await admin.from("city_events").update({ notified_at: new Date().toISOString() }).eq("id", e.id);
  }
  return list.length;
}
