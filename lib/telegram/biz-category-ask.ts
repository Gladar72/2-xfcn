import { InlineKeyboard, type Api, type Bot } from "grammy";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { BIZ_KEYS, BIZ_SECTIONS } from "@/lib/events/biz-categories";

/**
 * Разделы бизнес-событий: организаторам событий из «Другое» бот присылает
 * кнопки — выбрать раздел (Бары, Вечеринки и клубы…).
 *   /bizcat — админ видит, сколько таких событий и у скольких организаторов,
 *             и сам жмёт «Разослать».
 *   bc:<eventId>:<key> — организатор выбирает раздел (только своё событие).
 */

interface OtherEvent {
  id: string;
  title: string;
  organizer: { telegram_id: number | null } | null;
}

async function otherEvents(): Promise<OtherEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await createAdminClient()
    .from("events")
    .select("id, title, organizer:users(telegram_id)")
    .eq("is_business", true)
    .eq("biz_category", "other")
    .in("status", ["published", "closed"])
    .gte("event_date", today)
    .is("biz_category_asked_at", null) // кого уже спрашивали — второй раз не пишем
    .limit(300);
  return ((data ?? []) as unknown as OtherEvent[]).filter((e) => e.organizer?.telegram_id);
}

function sectionsKeyboard(eventId: string) {
  const kb = new InlineKeyboard();
  BIZ_SECTIONS.forEach((c, i) => {
    kb.text(c.label, `bc:${eventId}:${c.key}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

export function registerBizCategoryAsk(bot: Bot) {
  bot.command("bizcat", async (ctx) => {
    if (!isAdminTelegramId(ctx.from?.id ?? 0)) return;
    const list = await otherEvents();
    const organizers = new Set(list.map((e) => e.organizer!.telegram_id));
    if (!list.length) {
      await ctx.reply("Все будущие бизнес-события уже разложены по разделам 👌");
      return;
    }
    const titles = list.slice(0, 15).map((e) => `• ${e.title}`).join("\n");
    await ctx.reply(
      `В «Другое» — ${list.length} будущих бизнес-событий у ${organizers.size} организаторов:\n${titles}${list.length > 15 ? "\n…" : ""}\n\n` +
        "Разослать организаторам кнопки, чтобы они выбрали раздел?",
      { reply_markup: new InlineKeyboard().text(`✅ Разослать (${list.length})`, "bizcat_go").text("Отмена", "bizcat_cancel") }
    );
  });

  bot.callbackQuery("bizcat_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Ок, не рассылаю.").catch(() => {});
  });

  // Рассылка идёт — повторное нажатие «Разослать» ничего не делает.
  let sending = false;
  bot.callbackQuery("bizcat_go", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isAdminTelegramId(ctx.from.id) || sending) return;
    sending = true;
    await ctx.editMessageText("Рассылаю… ⏳").catch(() => {});
    try {
      await sendAll(ctx.api, (text) => ctx.editMessageText(text).catch(() => {}));
    } finally {
      sending = false;
    }
  });

  async function sendAll(api: Api, done: (text: string) => unknown) {
    const admin = createAdminClient();
    const list = await otherEvents();
    let sent = 0;
    for (const e of list) {
      try {
        await api.sendMessage(
          e.organizer!.telegram_id!,
          `Привет! В «Для бизнеса» теперь есть разделы — гости ищут события по ним.\n\n` +
            `Твоё событие «${e.title}» пока в разделе «Другое». Выбери, куда его поставить 👇`,
          { reply_markup: sectionsKeyboard(e.id) }
        );
        sent += 1;
      } catch {
        // человек заблокировал бота — пропускаем
      }
      await admin.from("events").update({ biz_category_asked_at: new Date().toISOString() }).eq("id", e.id);
      await new Promise((r) => setTimeout(r, 60));
    }
    await done(`Готово: разослал ${sent} из ${list.length}.`);
  }

  bot.callbackQuery(/^bc:([0-9a-f-]{36}):([a-z]+)$/, async (ctx) => {
    const eventId = ctx.match?.[1] ?? "";
    const key = ctx.match?.[2] ?? "";
    if (!BIZ_KEYS.has(key)) return ctx.answerCallbackQuery();
    const admin = createAdminClient();
    const { data: event } = await admin
      .from("events")
      .select("id, title, is_business, organizer:users(telegram_id)")
      .eq("id", eventId)
      .maybeSingle();
    const organizerTg = (event?.organizer as unknown as { telegram_id: number | null } | null)?.telegram_id;
    if (!event || !event.is_business) {
      await ctx.answerCallbackQuery({ text: "Это событие уже неактуально." });
      await ctx.editMessageReplyMarkup().catch(() => {});
      return;
    }
    if (Number(organizerTg) !== ctx.from.id) {
      await ctx.answerCallbackQuery({ text: "Менять раздел может только организатор события." });
      return;
    }
    const { error } = await admin.from("events").update({ biz_category: key }).eq("id", eventId);
    if (error) {
      await ctx.answerCallbackQuery({ text: "Не получилось сохранить — попробуй ещё раз чуть позже." });
      return;
    }
    const label = BIZ_SECTIONS.find((c) => c.key === key)?.label ?? key;
    await ctx.answerCallbackQuery({ text: `Готово: «${label}»` });
    await ctx
      .editMessageText(`Готово ✅ «${event.title}» теперь в разделе «${label}». Поменять можно в правке события.`)
      .catch(() => {});
  });
}
