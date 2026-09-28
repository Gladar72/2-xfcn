import { Bot, InlineKeyboard, type Context } from "grammy";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscriptions/server";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
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
  type ReferralPartner,
} from "@/lib/subscriptions/referrals";

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

  bot.command("start", async (ctx) => {
    // Переход по партнёрской ссылке t.me/<bot>?start=ref_<code> —
    // закрепляем человека за блогером (первый переход решает).
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (ctx.from && payload.startsWith(REFERRAL_START_PREFIX)) {
      await recordReferralStart(createAdminClient(), ctx.from.id, payload.slice(REFERRAL_START_PREFIX.length)).catch((err) =>
        console.error("recordReferralStart failed:", err)
      );
    }
    await ctx.reply("Отлично, теперь запустим наше МЕСТО! 🚀🧡", {
      reply_markup: startKeyboard(isAdminTelegramId(ctx.from?.id ?? 0)),
    });
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
      await ctx.api
        .sendMessage(Number(partner.telegram_id), `🎉 Заявка одобрена!\n\n${approvedPartnerText(link)}`, {
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
