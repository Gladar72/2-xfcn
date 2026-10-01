import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscriptions/server";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { handleRsvpAnswer } from "@/lib/telegram/event-reminders";
import type { Plan } from "@/lib/subscriptions/limits";
import {
  REFERRAL_START_PREFIX,
  applyForPartnership,
  formatAmounts,
  getPartnerById,
  getPartnerByTelegramId,
  getPartnerStats,
  markPayoutPaid,
  recordReferralCommission,
  recordReferralStart,
  referralLink,
  requestPayout,
  savePayoutDetails,
  setAwaitingPayoutDetails,
  setPartnerStatus,
  grantPartnerPremium,
  type ReferralPartner,
} from "@/lib/subscriptions/referrals";
import {
  DEFAULT_GIFT_CAMPAIGN,
  GIFT_START_PREFIX,
  bindGiftChannel,
  channelPostText,
  claimGift,
  getGiftCampaign,
  giftStats,
  planTitle,
  saveGiftVideoNote,
  welcomeText,
} from "@/lib/gifts/channel-gift";

function getAdminId(): number | null {
  const first = (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim();
  const id = Number(first);
  return first && !Number.isNaN(id) ? id : null;
}

/**
 * Бот собирается лениво (не на верхнем уровне модуля) — токен читается из
 * process.env только в момент первого запроса, а не во время сборки/импорта,
 * чтобы отсутствие переменной окружения на этапе build не роняло весь проект.
 */
let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (botInstance) return botInstance;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Отсутствует TELEGRAM_BOT_TOKEN в переменных окружения");

  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("Отсутствует APP_URL в переменных окружения");
  // Присваиваем в новую переменную: TypeScript не переносит сужение типа
  // (narrowing) из внешней области видимости внутрь вложенных функций —
  // без этого openAppKeyboard() ниже видел бы appUrl как `string | undefined`.
  const validatedAppUrl: string = appUrl;

  const bot = new Bot(token);

  function openAppKeyboard() {
    return new InlineKeyboard().webApp("Открыть приложение", validatedAppUrl);
  }

  // Постоянная клавиатура снизу экрана (не инлайн-кнопка под одним
  // сообщением, а закреплённая панель, которая остаётся видна всегда,
  // пока её не заменят/не уберут) — именно то, что попросил пользователь:
  // кнопка "Купить подписку" прямо под полем ввода сообщения.
  //
  // isAdmin (по telegram_id из ADMIN_TELEGRAM_IDS) добавляет третью
  // кнопку "Админ-панель" — видна ТОЛЬКО тому, у кого свой telegram_id в
  // этом списке; для всех остальных клавиатура ровно та же, что была.
  //
  // Инлайн-кнопки (под конкретным сообщением), а не закреплённая панель —
  // передача initData у web_app кнопок этого типа надёжнее задокументирована
  // и уже подтверждённо работает у /subscribe (см. ниже) с тем же самым
  // ?goto=subscriptions.
  function startKeyboard(isAdmin: boolean) {
    const kb = new InlineKeyboard();
    kb.webApp("Открыть приложение", validatedAppUrl);
    kb.row();
    kb.webApp("Купить подписку", `${validatedAppUrl}?goto=subscriptions`);
    kb.row();
    kb.text("🤝 Партнёрская программа", "ref_menu");
    if (isAdmin) {
      kb.row();
      kb.webApp("📊 Админ-панель", `${validatedAppUrl}?goto=admin`);
    }
    return kb;
  }

  // Закреплённые кнопки под полем ввода (reply-клавиатура, открывается
  // значком справа от поля сообщения). Текст кнопок ловится ниже в
  // message:text до ответа поддержки.
  const PARTNER_BUTTON = "🤝 Партнёрская программа";
  const ADMIN_BUTTON = "📊 Админ-панель";
  function pinnedKeyboard(isAdmin: boolean) {
    const kb = new Keyboard().text(PARTNER_BUTTON);
    if (isAdmin) kb.row().text(ADMIN_BUTTON);
    return kb.resized().persistent();
  }
  function adminPanelKeyboard() {
    return new InlineKeyboard().webApp("📊 Открыть админ-панель", `${validatedAppUrl}?goto=admin`);
  }

  bot.command("start", async (ctx) => {
    // Переход по партнёрской ссылке t.me/<bot>?start=ref_<code> —
    // закрепляем человека за блогером (первый переход решает).
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    // Кнопка «🎁 Забрать подписку» из поста в канале.
    if (ctx.from && payload.startsWith(GIFT_START_PREFIX)) {
      await handleGiftClaim(ctx, payload.slice(GIFT_START_PREFIX.length));
      return;
    }
    if (ctx.from && payload.startsWith(REFERRAL_START_PREFIX)) {
      await recordReferralStart(createAdminClient(), ctx.from.id, payload.slice(REFERRAL_START_PREFIX.length)).catch((err) =>
        console.error("recordReferralStart failed:", err)
      );
    }
    const isAdmin = isAdminTelegramId(ctx.from?.id ?? 0);
    await ctx.reply("Отлично, теперь запустим наше МЕСТО! 🚀🧡", {
      reply_markup: startKeyboard(isAdmin),
    });
    await ctx.reply("Кнопки закреплены внизу 👇", { reply_markup: pinnedKeyboard(isAdmin) });
  });

  // ── Подарок подписчикам канала («Двор» и т.п.) ───────────────────────
  // Бот не может сам написать тому, кто его не запускал, поэтому подарок
  // забирают кнопкой из поста в канале: бот проверяет подписку на канал
  // (он там админ), включает месяц подписки и присылает приветствие.
  async function handleGiftClaim(ctx: Context, code: string) {
    if (!ctx.from) return;
    const admin = createAdminClient();
    const campaign = await getGiftCampaign(admin, code || DEFAULT_GIFT_CAMPAIGN);
    if (!campaign || !campaign.is_active) {
      await ctx.reply("Эта акция уже закончилась 🙏 Но «Место» открыто всем — заходи 👇", {
        reply_markup: openAppKeyboard(),
      });
      return;
    }
    if (!campaign.channel_id) {
      await ctx.reply("Подарок ещё готовится — загляни чуть позже 🙏", { reply_markup: openAppKeyboard() });
      return;
    }

    let isSubscriber = false;
    try {
      const member = await ctx.api.getChatMember(campaign.channel_id, ctx.from.id);
      isSubscriber =
        member.status === "creator" ||
        member.status === "administrator" ||
        member.status === "member" ||
        (member.status === "restricted" && member.is_member);
    } catch (err) {
      console.error("gift: getChatMember failed", err);
      await ctx.reply("Не получилось проверить подписку на канал — попробуй ещё раз через минуту 🙏", {
        reply_markup: new InlineKeyboard().text("🔄 Проверить ещё раз", `gift_check:${campaign.code}`),
      });
      return;
    }

    if (!isSubscriber) {
      const kb = new InlineKeyboard();
      if (campaign.channel_username) kb.url(`📢 Подписаться на «${campaign.title}»`, `https://t.me/${campaign.channel_username}`).row();
      kb.text("✅ Я подписался — проверить", `gift_check:${campaign.code}`);
      await ctx.reply(
        `Этот подарок — для подписчиков канала «${campaign.title}» 🎁\nПодпишись на канал и нажми «Проверить».`,
        { reply_markup: kb }
      );
      return;
    }

    try {
      const result = await claimGift(admin, campaign, ctx.from.id);
      if (result.kind !== "already" && campaign.video_note_file_id) {
        await ctx.replyWithVideoNote(campaign.video_note_file_id).catch((err) => console.error("gift: video note failed", err));
      }
      await ctx.reply(welcomeText(campaign, result), { reply_markup: openAppKeyboard() });
    } catch (err) {
      console.error("gift: claim failed", err);
      await ctx.reply("Что-то пошло не так при включении подарка 🙏 Попробуй ещё раз чуть позже или напиши в поддержку: /support");
    }
  }

  bot.callbackQuery(/^gift_check:([a-z0-9_-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleGiftClaim(ctx, (ctx.match as RegExpMatchArray)[1] ?? DEFAULT_GIFT_CAMPAIGN);
  });

  function giftPostKeyboard(botUsername: string, code: string) {
    return new InlineKeyboard().url("🎁 Забрать подписку", `https://t.me/${botUsername}?start=${GIFT_START_PREFIX}${code}`);
  }

  async function sendGiftMenu(ctx: Context) {
    const admin = createAdminClient();
    const campaign = await getGiftCampaign(admin, DEFAULT_GIFT_CAMPAIGN);
    if (!campaign) {
      await ctx.reply("Кампания подарка не найдена.");
      return;
    }
    const stats = await giftStats(admin, campaign.code);
    const channelLine = campaign.channel_id
      ? `Канал: «${campaign.channel_title ?? campaign.title}»${campaign.channel_username ? ` (@${campaign.channel_username})` : ""} ✅`
      : `Канал ещё не привязан. Добавь бота @${ctx.me.username} админом канала (право «Публикация сообщений») — я сам пришлю кнопку привязки. Или пришли: /gift @имя_канала`;
    const videoLine = campaign.video_note_file_id
      ? "Кружок: записан ✅ (выйдет перед постом; чтобы заменить — просто пришли новый)"
      : "Кружок: не записан — запиши и пришли мне приветственный кружок, он выйдет перед постом.";
    const kb = new InlineKeyboard().text("👀 Предпросмотр поста", "gift_preview");
    if (campaign.channel_id) kb.row().text("📣 Опубликовать в канал", "gift_publish_ask");
    await ctx.reply(
      `🎁 Подарок «${campaign.title}»: подписка «${planTitle(campaign.plan)}» на ${campaign.days} дней.\n` +
        `${channelLine}\n${videoLine}\n\n` +
        `Забрали: ${stats.claimed} · включено: ${stats.applied} (остальные включатся после регистрации в приложении).`,
      { reply_markup: kb }
    );
  }

  bot.command("gift", async (ctx) => {
    if (!isAdminTelegramId(ctx.from?.id ?? 0)) return;
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (arg) {
      // Ручная привязка канала: /gift @username
      try {
        const chat = await ctx.api.getChat(arg.startsWith("@") || arg.startsWith("-") ? arg : `@${arg}`);
        const me = await ctx.api.getChatMember(chat.id, ctx.me.id);
        if (me.status !== "administrator") {
          await ctx.reply("Я не админ в этом канале. Добавь меня админом с правом публикации и повтори.");
          return;
        }
        await bindGiftChannel(createAdminClient(), DEFAULT_GIFT_CAMPAIGN, {
          id: chat.id,
          title: "title" in chat ? chat.title ?? null : null,
          username: "username" in chat ? chat.username ?? null : null,
        });
        await ctx.reply("✅ Канал привязан к подарку.");
      } catch (err) {
        console.error("gift bind failed", err);
        await ctx.reply("Не нашёл такой канал. Проверь имя (например, /gift @dvor) и что я там админ.");
        return;
      }
    }
    await sendGiftMenu(ctx);
  });

  // Бота сделали админом канала — предлагаем привязать канал к подарку.
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.myChatMember.chat;
    const status = ctx.myChatMember.new_chat_member.status;
    if (chat.type !== "channel" || status !== "administrator") return;
    const adminId = getAdminId();
    if (!adminId) return;
    await ctx.api
      .sendMessage(adminId, `Меня добавили админом в канал «${chat.title}». Привязать его к подарку «Двор»?`, {
        reply_markup: new InlineKeyboard().text("✅ Привязать", `gift_bind:${chat.id}`),
      })
      .catch((err) => console.error("gift: notify admin failed", err));
  });

  bot.callbackQuery(/^gift_bind:(-?\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isAdminTelegramId(ctx.from.id)) return;
    const chatId = Number((ctx.match as RegExpMatchArray)[1]);
    try {
      const chat = await ctx.api.getChat(chatId);
      await bindGiftChannel(createAdminClient(), DEFAULT_GIFT_CAMPAIGN, {
        id: chat.id,
        title: "title" in chat ? chat.title ?? null : null,
        username: "username" in chat ? chat.username ?? null : null,
      });
      await ctx.reply("✅ Канал привязан к подарку.");
      await sendGiftMenu(ctx);
    } catch (err) {
      console.error("gift bind failed", err);
      await ctx.reply("Не получилось привязать канал — проверь, что я там админ.");
    }
  });

  bot.callbackQuery("gift_preview", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isAdminTelegramId(ctx.from.id)) return;
    const campaign = await getGiftCampaign(createAdminClient(), DEFAULT_GIFT_CAMPAIGN);
    if (!campaign) return;
    await ctx.reply("Так будет выглядеть публикация в канале 👇");
    if (campaign.video_note_file_id) await ctx.replyWithVideoNote(campaign.video_note_file_id);
    await ctx.reply(channelPostText(campaign), { reply_markup: giftPostKeyboard(ctx.me.username, campaign.code) });
    await ctx.reply("А так — приветствие, которое получит человек после нажатия кнопки 👇");
    await ctx.reply(welcomeText(campaign, { kind: "granted", until: new Date(Date.now() + campaign.days * 86_400_000) }), {
      reply_markup: openAppKeyboard(),
    });
  });

  bot.callbackQuery("gift_publish_ask", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isAdminTelegramId(ctx.from.id)) return;
    const campaign = await getGiftCampaign(createAdminClient(), DEFAULT_GIFT_CAMPAIGN);
    if (!campaign?.channel_id) return;
    await ctx.reply(`Опубликовать пост с подарком в канал «${campaign.channel_title ?? campaign.title}»?`, {
      reply_markup: new InlineKeyboard().text("✅ Да, опубликовать", "gift_publish_go").text("Отмена", "gift_publish_cancel"),
    });
  });

  bot.callbackQuery("gift_publish_cancel", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Отменено" });
  });

  bot.callbackQuery("gift_publish_go", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!isAdminTelegramId(ctx.from.id)) return;
    const campaign = await getGiftCampaign(createAdminClient(), DEFAULT_GIFT_CAMPAIGN);
    if (!campaign?.channel_id) return;
    try {
      // Сначала приветственный кружок, сразу за ним — пост с кнопкой-подарком.
      if (campaign.video_note_file_id) {
        await ctx.api.sendVideoNote(campaign.channel_id, campaign.video_note_file_id);
      }
      await ctx.api.sendMessage(campaign.channel_id, channelPostText(campaign), {
        reply_markup: giftPostKeyboard(ctx.me.username, campaign.code),
      });
      await ctx.reply("📣 Опубликовано! Статистика — командой /gift");
    } catch (err) {
      console.error("gift publish failed", err);
      await ctx.reply("Не получилось опубликовать — проверь, что у меня есть право «Публикация сообщений» в канале.");
    }
  });

  // Админ присылает боту кружок — сохраняем его как приветствие к подарку.
  bot.on("message:video_note", async (ctx) => {
    if (!isAdminTelegramId(ctx.from.id)) return;
    await saveGiftVideoNote(createAdminClient(), DEFAULT_GIFT_CAMPAIGN, ctx.message.video_note.file_id);
    await ctx.reply("🎥 Кружок сохранён — он выйдет в канале перед постом-подарком и придёт каждому, кто заберёт подарок.", {
      reply_markup: new InlineKeyboard().text("👀 Предпросмотр", "gift_preview"),
    });
  });

  bot.command("admin", async (ctx) => {
    if (!isAdminTelegramId(ctx.from?.id ?? 0)) return;
    await ctx.reply("Админ-панель:", { reply_markup: adminPanelKeyboard() });
  });

  bot.command("app", async (ctx) => {
    await ctx.reply("Открыть приложение:", { reply_markup: openAppKeyboard() });
  });

  bot.command("subscribe", async (ctx) => {
    await ctx.reply("Оформить или продлить подписку — картой, СБП или Telegram Stars:", {
      reply_markup: new InlineKeyboard().webApp("Купить подписку", `${validatedAppUrl}?goto=subscriptions`),
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Как это работает:\n" +
        "1. Открой приложение кнопкой ниже.\n" +
        "2. Выбери, что хочешь сделать сегодня — тренировка, кино, кофе и т.д.\n" +
        "3. Найди подходящую встречу или создай свою.\n\n" +
        "Если что-то не работает — напиши /support.",
      { reply_markup: openAppKeyboard() }
    );
  });

  bot.command("support", async (ctx) => {
    await ctx.reply(
      "Опиши проблему в этом чате — мы читаем сообщения и стараемся отвечать как можно быстрее."
    );
  });

  // Обязательная команда для ботов с платежами (требование Telegram) —
  // свериться с актуальными правилами перед продакшн-запуском:
  // https://core.telegram.org/bots/payments
  bot.command("paysupport", async (ctx) => {
    await ctx.reply(
      "Вопросы по оплате подписки (Telegram Stars): опиши проблему здесь, " +
        "укажи дату и тариф — разберёмся и, если нужно, оформим возврат через Telegram."
    );
  });

  // Оплата Telegram Stars — обязательное подтверждение ДО списания (10
  // секунд на ответ, иначе Telegram сам отменит платёж). Мы уже проверили
  // план и создали инвойс на сервере (см. create-invoice route), так что
  // здесь просто подтверждаем без дополнительных проверок.
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true).catch((err) => {
      console.error("answerPreCheckoutQuery failed:", err);
    });
  });

  // Реальное списание произошло — вот этот апдейт и есть источник истины
  // (п.25 ТЗ: "не доверять client-side подтверждению оплаты"). Активируем
  // подписку той же функцией, что и для оплаты через ЮKassa.
  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;

    let payload: { userId: string; plan: Plan };
    try {
      payload = JSON.parse(payment.invoice_payload);
    } catch {
      console.error("successful_payment: не удалось разобрать invoice_payload:", payment.invoice_payload);
      return;
    }

    const admin = createAdminClient();
    const { subscriptionId } = await activateSubscription(admin, payload.userId, payload.plan);

    const { data: paymentRow } = await admin
      .from("payments")
      .insert({
        user_id: payload.userId,
        subscription_id: subscriptionId,
        plan: payload.plan,
        amount: payment.total_amount,
        currency: payment.currency,
        telegram_payment_charge_id: payment.telegram_payment_charge_id,
        status: "succeeded",
      })
      .select("id")
      .single();

    if (paymentRow) {
      await recordReferralCommission(
        admin,
        { paymentId: paymentRow.id, userId: payload.userId, amount: payment.total_amount, currency: payment.currency },
        (telegramId, text) => ctx.api.sendMessage(telegramId, text)
      );
    }

    await ctx.reply(`✅ Оплата прошла — подписка «${payload.plan.toUpperCase()}» активирована на 30 дней.`, {
      reply_markup: openAppKeyboard(),
    });
  });

  // Кнопка "Отключить напоминания" под утренним сообщением (см.
  // lib/morning-reminders/) — отключает ТОЛЬКО эти приглашения, обычные
  // уведомления (заявки, чаты, отзывы) продолжают приходить как раньше.
  bot.callbackQuery("disable_morning_reminders", async (ctx) => {
    const admin = createAdminClient();
    await admin.from("users").update({ morning_reminders_enabled: false }).eq("telegram_id", ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply("Хорошо, больше не буду напоминать по утрам. Включить снова можно в настройках приложения в любой момент.");
  });

  // Кнопки «✅ Иду» / «❌ Не смогу» под напоминанием за 2 часа до встречи
  // (см. lib/telegram/event-reminders.ts).
  bot.callbackQuery(/^rsvp:(y|n):([0-9a-f-]{36})$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const answer = match[1] === "y" ? "going" : "not_going";
    const result = await handleRsvpAnswer(createAdminClient(), ctx.api, {
      rsvpId: match[2] ?? "",
      answer,
      fromTelegramId: ctx.from.id,
    });
    await ctx.answerCallbackQuery({ text: result.ok ? undefined : result.text });

    // Убираем кнопки под напоминанием и дописываем ответ — чтобы было видно,
    // что выбор учтён, и нельзя было нажать повторно.
    const sourceMessage = ctx.callbackQuery.message;
    const originalText = sourceMessage && "text" in sourceMessage ? sourceMessage.text ?? "" : "";
    await ctx
      .editMessageText(`${originalText}\n\n${result.text}`, { reply_markup: undefined })
      .catch(() => {});
  });

  // ─── Партнёрская программа для блогеров ───────────────────────────────
  // Блогер: «🤝 Партнёрская программа» → заявка → админ одобряет →
  // личная ссылка, статистика, запрос выплаты. 30% с каждой оплаты
  // подписки приведённых людей (см. lib/subscriptions/referrals.ts).

  function partnerMenuKeyboard(link: string) {
    const shareText = "МЕСТО — находи компанию на кофе, тренировку, кино и прогулки 🧡";
    return new InlineKeyboard()
      .text("📊 Статистика", "ref_stats")
      .row()
      .text("💸 Запросить выплату", "ref_payout")
      .row()
      .text("💳 Реквизиты для выплат", "ref_details")
      .row()
      .url("📤 Поделиться ссылкой", `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`);
  }

  // Коротко о проекте — отправляется блогеру при одобрении заявки, чтобы
  // было из чего собрать пост/сторис.
  const PROJECT_BRIEF =
    "Коротко о проекте — пригодится для постов и сторис:\n" +
    "• МЕСТО — мини-приложение в Telegram, где находят компанию на конкретное дело: кофе, тренировка, кино, прогулка, завтрак или ужин.\n" +
    "• Сначала активность, потом человек — это не знакомства и не свайпы.\n" +
    "• Видно, кто куда идёт: лента встреч и карта города.\n" +
    "• Нажимаешь «Я иду» → организатор принимает → открывается чат участников.\n" +
    "• После встречи — отзывы и рейтинг, поэтому здесь собираются надёжные люди.\n" +
    "• Смотреть встречи и присоединяться — бесплатно. Подписка от 299 ₽/мес нужна, чтобы создавать свои встречи.\n" +
    "• Работает прямо в Telegram — ничего не нужно скачивать.";

  // Условия сотрудничества — тоже в сообщении об одобрении.
  const PARTNER_TERMS =
    "Условия сотрудничества:\n" +
    "• Что нужно от вас: рассказать о МЕСТО в сторис или посте и добавить свою личную ссылку (она ниже).\n" +
    "• Ваш доход: 30% с каждой оплаты подписки людей, пришедших по ссылке — со всех оплат, включая продления, без ограничения по сроку.\n" +
    "• Кто перешёл по вашей ссылке, закрепляется за вами навсегда.\n" +
    "• Статистику (переходы, покупки, заработок) смотрите по кнопке «📊 Статистика».\n\n" +
    "Как получить выплату:\n" +
    "1. Нажмите «💳 Реквизиты для выплат» и отправьте номер телефона для СБП и банк (или номер карты) и ФИО.\n" +
    "2. Нажмите «💸 Запросить выплату» — выводится вся накопленная сумма.\n" +
    "3. Мы переводим деньги на ваши реквизиты и присылаем уведомление сюда, в бот.";

  function approvedPartnerText(link: string) {
    return (
      "🤝 Вы партнёр МЕСТО!\n\n" +
      "Ваша личная ссылка:\n" +
      `${link}\n\n` +
      "Все, кто перейдёт по ней, закрепляются за вами навсегда. С каждой их оплаты подписки — " +
      "включая продления — вы получаете 30%."
    );
  }

  async function sendPartnerMenu(ctx: Context) {
    const from = ctx.from;
    if (!from) return;
    const admin = createAdminClient();
    const partner = await getPartnerByTelegramId(admin, from.id);

    if (!partner) {
      await ctx.reply(
        "🤝 Партнёрская программа МЕСТО\n\n" +
          "Рекомендуйте МЕСТО своей аудитории и получайте 30% с каждой оплаты подписки приведённых людей — " +
          "со всех оплат, включая продления, без ограничения по сроку.\n\n" +
          "Как это работает:\n" +
          "1. Подайте заявку — мы рассмотрим её в ближайшее время.\n" +
          "2. После одобрения получите личную ссылку.\n" +
          "3. Все, кто перейдёт по ней, закрепляются за вами.\n" +
          "4. Статистика и выплаты — прямо здесь, в боте.",
        { reply_markup: new InlineKeyboard().text("📝 Подать заявку", "ref_apply") }
      );
      return;
    }
    if (partner.status === "pending") {
      await ctx.reply("⏳ Ваша заявка на рассмотрении. Как только её одобрят, пришлём сюда вашу личную ссылку.");
      return;
    }
    if (partner.status === "rejected") {
      await ctx.reply("К сожалению, заявка в партнёрскую программу отклонена. Если есть вопросы — напишите /support.");
      return;
    }
    const link = referralLink(ctx.me.username, partner.code);
    await ctx.reply(approvedPartnerText(link), {
      reply_markup: partnerMenuKeyboard(link),
      link_preview_options: { is_disabled: true },
    });
  }

  async function requireApprovedPartner(ctx: Context): Promise<ReferralPartner | null> {
    const partner = ctx.from ? await getPartnerByTelegramId(createAdminClient(), ctx.from.id) : null;
    if (!partner || partner.status !== "approved") {
      await sendPartnerMenu(ctx);
      return null;
    }
    return partner;
  }

  function partnerTitle(p: ReferralPartner) {
    const name = p.first_name ?? "Без имени";
    return p.telegram_username ? `${name} (@${p.telegram_username})` : `${name} (id ${p.telegram_id})`;
  }

  bot.command("partner", sendPartnerMenu);

  bot.callbackQuery("ref_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendPartnerMenu(ctx);
  });

  bot.callbackQuery("ref_apply", async (ctx) => {
    await ctx.answerCallbackQuery();
    const admin = createAdminClient();
    const { partner, created } = await applyForPartnership(admin, {
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
    if (!created) {
      await sendPartnerMenu(ctx);
      return;
    }
    await ctx.reply("✅ Заявка отправлена! Мы рассмотрим её и пришлём сюда вашу личную ссылку.");

    const adminId = getAdminId();
    if (adminId) {
      await ctx.api
        .sendMessage(adminId, `🤝 Новая заявка в партнёрскую программу:\n${partnerTitle(partner)}`, {
          reply_markup: new InlineKeyboard()
            .text("✅ Одобрить", `ref_approve:${partner.id}`)
            .text("❌ Отклонить", `ref_reject:${partner.id}`),
        })
        .catch((err) => console.error("Не удалось отправить заявку партнёра админу:", err));
    }
  });

  bot.callbackQuery("ref_stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await requireApprovedPartner(ctx);
    if (!partner) return;
    const s = await getPartnerStats(createAdminClient(), partner.id);
    await ctx.reply(
      "📊 Ваша статистика\n\n" +
        `Перешли по ссылке: ${s.joined}\n` +
        `Зарегистрировались: ${s.registered}\n` +
        `Купили подписку: ${s.buyers}\n` +
        `Всего оплат: ${s.payments}\n\n` +
        `💰 Заработано всего: ${formatAmounts(s.earned)}\n` +
        `Доступно к выводу: ${formatAmounts(s.available)}\n` +
        `Ожидает выплаты: ${formatAmounts(s.requested)}\n` +
        `Выплачено: ${formatAmounts(s.paid)}`,
      { reply_markup: new InlineKeyboard().text("💸 Запросить выплату", "ref_payout").row().text("⬅️ Меню партнёра", "ref_menu") }
    );
  });

  bot.callbackQuery("ref_details", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await requireApprovedPartner(ctx);
    if (!partner) return;
    await setAwaitingPayoutDetails(createAdminClient(), partner.id, true);
    await ctx.reply(
      (partner.payout_details ? `Сейчас сохранено:\n${partner.payout_details}\n\n` : "") +
        "Отправьте одним сообщением реквизиты для выплат: номер телефона для СБП и банк (или номер карты), ФИО получателя."
    );
  });

  bot.callbackQuery("ref_payout", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await requireApprovedPartner(ctx);
    if (!partner) return;
    const admin = createAdminClient();

    if (!partner.payout_details) {
      await setAwaitingPayoutDetails(admin, partner.id, true);
      await ctx.reply(
        "Сначала укажите реквизиты для выплаты. Отправьте одним сообщением: номер телефона для СБП и банк (или номер карты), ФИО получателя."
      );
      return;
    }

    const payout = await requestPayout(admin, partner);
    if (!payout) {
      await ctx.reply("Пока нечего выводить — начисления появятся после оплат по вашей ссылке.");
      return;
    }

    const amounts = formatAmounts({ RUB: payout.amountRub, XTR: payout.amountStars });
    await ctx.reply(`✅ Запрос на выплату ${amounts} отправлен. Сообщим, как только деньги будут переведены.`);

    const adminId = getAdminId();
    if (adminId) {
      await ctx.api
        .sendMessage(
          adminId,
          `💸 Запрос выплаты от партнёра ${partnerTitle(partner)}\n\n` +
            `Сумма: ${amounts}\n` +
            (payout.amountStars > 0 ? "(звёзды — по вашему курсу в рублях)\n" : "") +
            `Реквизиты: ${partner.payout_details}`,
          { reply_markup: new InlineKeyboard().text("✅ Выплачено", `ref_paid:${payout.payoutId}`) }
        )
        .catch((err) => console.error("Не удалось отправить запрос выплаты админу:", err));
    }
  });

  // Кнопки админа (одобрить/отклонить заявку, отметить выплату) — только
  // для telegram_id из ADMIN_TELEGRAM_IDS.
  bot.callbackQuery(/^ref_(approve|reject|paid):(.+)$/, async (ctx) => {
    if (!isAdminTelegramId(ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: "Нет доступа" });
      return;
    }
    await ctx.answerCallbackQuery();
    const match = ctx.match as RegExpMatchArray;
    const action = match[1] ?? "";
    const id = match[2] ?? "";
    const admin = createAdminClient();
    const sourceMessage = ctx.callbackQuery.message;
    const originalText = sourceMessage && "text" in sourceMessage ? sourceMessage.text ?? "" : "";

    if (action === "paid") {
      const result = await markPayoutPaid(admin, id);
      await ctx.editMessageText(`${originalText}\n\n✅ Выплачено`).catch(() => {});
      if (result) {
        await ctx.api
          .sendMessage(
            Number(result.partner.telegram_id),
            `💸 Выплата ${formatAmounts({ RUB: result.amountRub, XTR: result.amountStars })} отправлена на ваши реквизиты. Спасибо, что вы с МЕСТО!`
          )
          .catch(() => {});
      }
      return;
    }

    const partner = await getPartnerById(admin, id);
    if (!partner) return;
    const status = action === "approve" ? "approved" : "rejected";
    await setPartnerStatus(admin, partner.id, status);
    await ctx.editMessageText(`${originalText}\n\n${status === "approved" ? "✅ Одобрено" : "❌ Отклонено"}`).catch(() => {});

    if (status === "approved") {
      const link = referralLink(ctx.me.username, partner.code);
      // Партнёрам-блогерам — бесплатный Премиум (если уже зарегистрированы в
      // приложении; иначе включится при регистрации).
      const premiumOn = await grantPartnerPremium(admin, Number(partner.telegram_id)).catch(() => false);
      const premiumLine = premiumOn
        ? "🎁 Тебе включён бесплатный тариф «Премиум» — все функции приложения без ограничений."
        : "🎁 Тебе положен бесплатный тариф «Премиум» — он включится сразу, как зарегистрируешься в приложении.";
      await ctx.api
        .sendMessage(Number(partner.telegram_id), `🎉 Заявка одобрена! Добро пожаловать в партнёры МЕСТО.\n\n${premiumLine}\n\n${PROJECT_BRIEF}\n\n${PARTNER_TERMS}\n\n${approvedPartnerText(link)}`, {
          reply_markup: partnerMenuKeyboard(link),
          link_preview_options: { is_disabled: true },
        })
        .catch(() => {});
    } else {
      await ctx.api
        .sendMessage(Number(partner.telegram_id), "К сожалению, заявка в партнёрскую программу отклонена.")
        .catch(() => {});
    }
  });

  // Свободный текст (не команда) в чате с ботом = обращение в поддержку.
  // Правило порядка: обработчики выше (.command(...)) уже "съедают" команды
  // и не вызывают next(), так что сюда попадают только обычные сообщения.
  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;

    if (userMessage === PARTNER_BUTTON) {
      await sendPartnerMenu(ctx);
      return;
    }
    if (userMessage === ADMIN_BUTTON && isAdminTelegramId(ctx.from.id)) {
      await ctx.reply("Админ-панель:", { reply_markup: adminPanelKeyboard() });
      return;
    }

    // Партнёр нажал «Реквизиты» / «Запросить выплату» и теперь присылает
    // реквизиты — сохраняем их, а не отправляем в поддержку.
    const partner = await getPartnerByTelegramId(createAdminClient(), ctx.from.id).catch(() => null);
    if (partner?.awaiting_payout_details) {
      await savePayoutDetails(createAdminClient(), partner.id, userMessage);
      await ctx.reply("✅ Реквизиты сохранены.", {
        reply_markup: new InlineKeyboard().text("💸 Запросить выплату", "ref_payout").row().text("⬅️ Меню партнёра", "ref_menu"),
      });
      return;
    }

    const { reply, needsHuman } = await getSupportAiReply(userMessage);
    await ctx.reply(reply);

    const adminId = getAdminId();
    if (needsHuman && adminId) {
      const from = ctx.from;
      const who = from?.username ? `@${from.username}` : from?.first_name ?? "пользователь";
      await ctx.api
        .sendMessage(
          adminId,
          `📩 Вопрос в поддержку от ${who} (id ${from?.id}):\n\n${userMessage}\n\n— Ответ бота: ${reply}`
        )
        .catch((err) => console.error("Не удалось переслать вопрос админу:", err));
    }
  });

  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  // Список команд в меню бота (значок рядом с полем ввода сообщения) —
  // без этого вызова Telegram не показывает команды со стрелочки, только
  // если пользователь наберёт их вручную. Вызывается один раз при первом
  // "холодном" запуске функции (botInstance кэшируется ниже), не на каждый
  // апдейт — лишний вызов API Telegram не нужен.
  bot.api
    .setMyCommands([
      { command: "start", description: "Запустить бота" },
      { command: "app", description: "Открыть приложение" },
      { command: "subscribe", description: "Купить подписку" },
      { command: "help", description: "Как это работает" },
      { command: "support", description: "Написать в поддержку" },
      { command: "partner", description: "Партнёрская программа" },
    ])
    .catch((err) => console.error("setMyCommands failed:", err));

  botInstance = bot;
  return bot;
}
