cat > "lib/telegram/bot.ts" << 'ENDOFFILE'
import { Bot, InlineKeyboard } from "grammy";

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

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Отлично, теперь запустим наше МЕСТО! 🚀🧡",
      { reply_markup: openAppKeyboard() }
    );
  });

  bot.command("app", async (ctx) => {
    await ctx.reply("Открыть приложение:", { reply_markup: openAppKeyboard() });
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

  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  botInstance = bot;
  return bot;
}
ENDOFFILE
