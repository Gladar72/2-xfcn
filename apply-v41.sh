mkdir -p "lib/telegram"
cat > "lib/telegram/bot.ts" << 'ENDOFFILE'
import { Bot, InlineKeyboard } from "grammy";
import { getSupportAiReply } from "@/lib/telegram/support-ai";

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

  botInstance = bot;
  return bot;
}
ENDOFFILE

mkdir -p "lib/telegram"
cat > "lib/telegram/support-ai.ts" << 'ENDOFFILE'
/**
 * Отвечает на вопросы пользователей в чате поддержки бота по заготовленным
 * шаблонам (без внешнего ИИ — Claude API недоступен для регистрации из РФ
 * из-за экспортных ограничений США, поэтому пока используем rule-based
 * вариант). ЛЮБОЕ сообщение пользователя, независимо от того, нашёлся ли
 * подходящий шаблон, всегда пересылается администратору лично в Telegram —
 * см. needsHuman: true везде ниже и обработку в bot.ts.
 */

export interface SupportAiResult {
  reply: string;
  needsHuman: boolean;
}

// Порядок важен — проверяются по очереди, срабатывает первое совпадение.
const RULES: { keywords: string[]; reply: string }[] = [
  {
    keywords: ["привет", "здравств", "добрый день", "добрый вечер", "доброе утро"],
    reply:
      "Привет! 👋 Опиши, пожалуйста, свой вопрос подробнее — я постараюсь помочь, а если понадобится, передам команде.",
  },
  {
    keywords: ["как создать", "создать встреч", "как сделать встреч", "организовать встреч"],
    reply:
      "Чтобы создать встречу: на главном экране выбери категорию (или «Своё предложение»), укажи место на карте, дату, время и детали. Встреча появится в ленте у людей в твоём городе.",
  },
  {
    keywords: ["как откликн", "как присоедин", "как записаться", "как попасть на встреч"],
    reply:
      "Найди встречу в ленте или через поиск и нажми «Откликнуться». Организатор увидит твою заявку и примет её — после этого откроется чат.",
  },
  {
    keywords: ["цена", "стоимост", "тариф", "подписк", "сколько стоит", "сколько стои"],
    reply:
      "Актуальные тарифы и цены — в разделе «Подписка» в профиле приложения, там же можно оформить или продлить. Точные цифры называть не буду, чтобы не ошибиться — они могут немного меняться.",
  },
  {
    keywords: ["отменить встреч", "как отменить", "удалить встреч"],
    reply:
      "Отменить свою встречу можно на странице этой встречи (если ты организатор) — кнопка «Отменить встречу» внизу. Лимит на создание встреч за отменённую вернётся автоматически.",
  },
  {
    keywords: ["сменить город", "поменять город", "другой город"],
    reply: "Город меняется на главном экране — нажми на кнопку с названием города вверху и впиши нужный.",
  },
  {
    keywords: ["не работает", "ошибка", "баг", "не открывается", "завис"],
    reply:
      "Спасибо, что сообщил! Опиши, пожалуйста, что именно происходит (на каком экране, что нажимал) — передам команде, разберёмся.",
  },
  {
    keywords: ["оплат", "деньги", "возврат", "списал", "платёж", "платеж"],
    reply: "Вопросы по оплате и возвратам передаю команде напрямую — ответят здесь же в этом чате.",
  },
  {
    keywords: ["пожалов", "нарушил", "оскорб", "заблокир"],
    reply: "Жалобы на других пользователей рассматриваем лично — передал вопрос команде.",
  },
];

const FALLBACK_REPLY = "Спасибо за сообщение! Передал вопрос команде — скоро ответят здесь же.";

export async function getSupportAiReply(userMessage: string): Promise<SupportAiResult> {
  const text = userMessage.toLowerCase();
  const matched = RULES.find((rule) => rule.keywords.some((kw) => text.includes(kw)));

  return {
    reply: matched?.reply ?? FALLBACK_REPLY,
    // Всегда true: даже когда шаблон подошёл, сообщение всё равно должно
    // дойти до администратора лично — это было явное требование пользователя.
    needsHuman: true,
  };
}
ENDOFFILE

