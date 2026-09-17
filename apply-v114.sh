cat > "lib/telegram/bot.ts" << 'ENDOFFILE'
import { Bot, InlineKeyboard } from "grammy";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscriptions/server";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import type { Plan } from "@/lib/subscriptions/limits";

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
    if (isAdmin) {
      kb.row();
      kb.webApp("📊 Админ-панель", `${validatedAppUrl}?goto=admin`);
    }
    return kb;
  }

  bot.command("start", async (ctx) => {
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

    await admin.from("payments").insert({
      user_id: payload.userId,
      subscription_id: subscriptionId,
      plan: payload.plan,
      amount: payment.total_amount,
      currency: payment.currency,
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      status: "succeeded",
    });

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

  // Свободный текст (не команда) в чате с ботом = обращение в поддержку.
  // Правило порядка: обработчики выше (.command(...)) уже "съедают" команды
  // и не вызывают next(), так что сюда попадают только обычные сообщения.
  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
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
    ])
    .catch((err) => console.error("setMyCommands failed:", err));

  botInstance = bot;
  return bot;
}
ENDOFFILE
