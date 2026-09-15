mkdir -p "lib/subscriptions"
cat > "lib/subscriptions/server.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "./limits";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ActiveSubscriptionInfo {
  subscriptionId: string;
  plan: Plan;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  eventsCreatedCount: number;
  boostsUsedCount: number;
}

/**
 * Возвращает активную подписку пользователя вместе со счётчиками
 * использования за ТЕКУЩИЙ расчётный период (создаёт строку в
 * subscription_usage, если её ещё нет — например, сразу после оплаты).
 *
 * Возвращает null, если активной подписки нет — тогда вызывающий код
 * должен показать paywall (см. app/api/subscriptions/route.ts).
 */
export async function getActiveSubscriptionInfo(
  admin: AdminClient,
  userId: string
): Promise<ActiveSubscriptionInfo | null> {
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, plan, current_period_start, current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!subscription) return null;

  const { data: existingUsage } = await admin
    .from("subscription_usage")
    .select("events_created_count, boosts_used_count")
    .eq("subscription_id", subscription.id)
    .eq("period_start", subscription.current_period_start)
    .maybeSingle();

  if (existingUsage) {
    return {
      subscriptionId: subscription.id,
      plan: subscription.plan as Plan,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      eventsCreatedCount: existingUsage.events_created_count,
      boostsUsedCount: existingUsage.boosts_used_count,
    };
  }

  const { data: createdUsage } = await admin
    .from("subscription_usage")
    .insert({
      subscription_id: subscription.id,
      period_start: subscription.current_period_start,
      period_end: subscription.current_period_end,
    })
    .select("events_created_count, boosts_used_count")
    .single();

  return {
    subscriptionId: subscription.id,
    plan: subscription.plan as Plan,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    eventsCreatedCount: createdUsage?.events_created_count ?? 0,
    boostsUsedCount: createdUsage?.boosts_used_count ?? 0,
  };
}

/**
 * Атомарно увеличивает счётчик созданных встреч за период.
 * Использует UPDATE ... SET x = x + 1 (не read-modify-write из JS),
 * чтобы избежать гонки при параллельных запросах.
 */
export async function incrementEventsCreated(
  admin: AdminClient,
  subscriptionId: string,
  periodStart: string
): Promise<void> {
  await admin.rpc("increment_subscription_usage_field", {
    p_subscription_id: subscriptionId,
    p_period_start: periodStart,
    p_field: "events_created_count",
  });
}

export async function incrementBoostsUsed(
  admin: AdminClient,
  subscriptionId: string,
  periodStart: string
): Promise<void> {
  await admin.rpc("increment_subscription_usage_field", {
    p_subscription_id: subscriptionId,
    p_period_start: periodStart,
    p_field: "boosts_used_count",
  });
}

const SUBSCRIPTION_PERIOD_DAYS = 30;

/**
 * Активирует (или продлевает/меняет тариф) подписку пользователя после
 * РЕАЛЬНО подтверждённой оплаты — источник истины всегда сервер платёжной
 * системы (Telegram после successful_payment, ЮKassa после проверки
 * статуса платежа через её API), никогда клиент.
 *
 * Общая для обоих способов оплаты (Stars и ЮKassa) — чтобы активация не
 * расходилась в двух местах. У пользователя может быть максимум одна
 * активная подписка (см. unique index subscriptions_one_active_per_user) —
 * если уже есть активная, продлеваем/меняем её тариф на месте, а не
 * создаём вторую строку.
 */
export async function activateSubscription(
  admin: AdminClient,
  userId: string,
  plan: Plan
): Promise<{ subscriptionId: string; periodStart: string; periodEnd: string }> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const periodStartIso = now.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    await admin
      .from("subscriptions")
      .update({ plan, current_period_start: periodStartIso, current_period_end: periodEndIso })
      .eq("id", existing.id);
    return { subscriptionId: existing.id, periodStart: periodStartIso, periodEnd: periodEndIso };
  }

  const { data: created, error } = await admin
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan,
      status: "active",
      current_period_start: periodStartIso,
      current_period_end: periodEndIso,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Не удалось активировать подписку для ${userId}: ${error?.message}`);
  }

  return { subscriptionId: created.id, periodStart: periodStartIso, periodEnd: periodEndIso };
}
ENDOFFILE

mkdir -p "lib/payments"
cat > "lib/payments/yookassa.ts" << 'ENDOFFILE'
/**
 * Минимальный клиент для API ЮKassa (https://yookassa.ru/developers/api).
 *
 * Ключи — YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY — берутся из личного
 * кабинета ЮKassa (yookassa.ru → Настройки → API). ВАЖНО: секретный ключ
 * должен оставаться только на сервере (без префикса NEXT_PUBLIC_) — тот же
 * урок, что уже был с ключом Геокодера в этом проекте.
 */

interface CreatePaymentParams {
  userId: string;
  plan: string;
  amountRub: number;
  description: string;
  returnUrl: string;
}

export interface YooKassaPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  metadata: Record<string, string>;
  confirmation?: { confirmation_url?: string };
}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error("Отсутствуют YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY в переменных окружения");
  }
  return "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64");
}

/**
 * Создаёт платёж в ЮKassa и возвращает ссылку для редиректа пользователя
 * на страницу оплаты (карта, СБП и другие способы, включённые в кабинете
 * ЮKassa). Idempotence-Key — обязательный для ЮKassa заголовок, защищает
 * от повторного списания при случайном повторе запроса (например, если
 * ответ потерялся по сети и клиент отправил запрос ещё раз).
 */
export async function createYooKassaPayment(params: CreatePaymentParams): Promise<YooKassaPayment> {
  const idempotenceKey = crypto.randomUUID();

  const res = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
      confirmation: { type: "redirect", return_url: params.returnUrl },
      capture: true,
      description: params.description,
      metadata: { userId: params.userId, plan: params.plan },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ЮKassa: не удалось создать платёж (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

/**
 * Запрашивает АКТУАЛЬНЫЙ статус платежа напрямую у ЮKassa. Используется в
 * обработчике вебхука вместо доверия телу входящего запроса — тело
 * вебхука в теории можно подделать (отправить фейковый POST на наш
 * публичный эндпоинт), а прямой запрос к API с нашим секретным ключом
 * подделать нельзя.
 */
export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  const res = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ЮKassa: не удалось получить статус платежа ${paymentId} (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}
ENDOFFILE

mkdir -p "app/api/subscriptions/yookassa/create-payment"
cat > "app/api/subscriptions/yookassa/create-payment/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";

const PLAN_TITLES: Record<Plan, string> = {
  start: "Подписка «Старт»",
  medium: "Подписка «Медиум»",
  premium: "Подписка «Премьер»",
};

/**
 * POST /api/subscriptions/yookassa/create-payment
 * Body: { plan: "start" | "medium" | "premium" }
 *
 * Второй способ оплаты подписки — картой/СБП через ЮKassa, в дополнение
 * к оплате Telegram Stars. Работает и из приложения, и из кнопки в боте
 * (обе точки входа ведут на один и тот же Mini App с уже действующей
 * сессией — см. app/page.tsx, параметр goto).
 *
 * Активация подписки происходит НЕ здесь, а в вебхуке после реального
 * подтверждённого платежа — см. app/api/webhooks/yookassa/route.ts.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan as Plan | undefined;
  if (!plan || !(plan in PLAN_LIMITS)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });

  const admin = createAdminClient();
  const limits = PLAN_LIMITS[plan];

  try {
    const payment = await createYooKassaPayment({
      userId: user.userId,
      plan,
      amountRub: limits.priceRub,
      description: `${PLAN_TITLES[plan]} на 30 дней`,
      returnUrl: `${appUrl}/subscriptions?paid=1`,
    });

    // Записываем как "pending" сразу — если человек закроет страницу
    // оплаты не завершив её, у нас всё равно останется след платежа для
    // сверки/поддержки, а не только успешные попытки.
    await admin.from("payments").insert({
      user_id: user.userId,
      plan,
      amount: limits.priceRub,
      currency: "RUB",
      external_payment_id: payment.id,
      status: "pending",
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) return NextResponse.json({ error: "no_confirmation_url" }, { status: 502 });

    return NextResponse.json({ confirmationUrl });
  } catch (err) {
    console.error("POST /api/subscriptions/yookassa/create-payment:", err);
    return NextResponse.json({ error: "payment_creation_failed" }, { status: 502 });
  }
}
ENDOFFILE

mkdir -p "app/api/webhooks/yookassa"
cat > "app/api/webhooks/yookassa/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYooKassaPayment } from "@/lib/payments/yookassa";
import { activateSubscription } from "@/lib/subscriptions/server";
import { notifyTelegram } from "@/lib/telegram/notify";
import type { Plan } from "@/lib/subscriptions/limits";

/**
 * POST /api/webhooks/yookassa
 *
 * ЮKassa шлёт сюда уведомление о статусе платежа. КЛЮЧЕВОЕ правило
 * безопасности: тело этого запроса — не источник истины. Кто угодно в
 * интернете может отправить POST на этот публичный URL с поддельным телом
 * вида {"event": "payment.succeeded", ...}. Поэтому по id платежа из тела
 * мы ВСЕГДА дополнительно запрашиваем реальный статус напрямую у ЮKassa
 * через API с нашим секретным ключом (подделать этот встречный запрос
 * нельзя) — и активируем подписку только по его результату.
 *
 * Идемпотентность: если платёж уже помечен как succeeded в нашей базе —
 * просто отвечаем 200 и ничего не делаем повторно (ЮKassa может прислать
 * уведомление больше одного раза).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const paymentId = body?.object?.id as string | undefined;

  if (!paymentId) {
    // Отвечаем 200 в любом случае — ЮKassa не должна повторять доставку
    // некорректного тела бесконечно.
    return NextResponse.json({ status: "ignored" });
  }

  const admin = createAdminClient();

  const { data: paymentRow } = await admin
    .from("payments")
    .select("id, user_id, plan, status")
    .eq("external_payment_id", paymentId)
    .maybeSingle();

  if (!paymentRow) {
    console.error(`Вебхук ЮKassa: платёж ${paymentId} не найден в нашей базе`);
    return NextResponse.json({ status: "unknown_payment" });
  }

  if (paymentRow.status === "succeeded") {
    return NextResponse.json({ status: "already_processed" });
  }

  let realStatus;
  try {
    realStatus = await getYooKassaPayment(paymentId);
  } catch (err) {
    console.error("Вебхук ЮKassa: не удалось проверить статус платежа:", err);
    // Возвращаем ошибку — пусть ЮKassa повторит доставку вебхука позже.
    return NextResponse.json({ status: "verification_failed" }, { status: 502 });
  }

  if (!realStatus.paid || realStatus.status !== "succeeded") {
    await admin.from("payments").update({ status: realStatus.status }).eq("id", paymentRow.id);
    return NextResponse.json({ status: "not_paid_yet" });
  }

  const plan = paymentRow.plan as Plan;
  const { subscriptionId } = await activateSubscription(admin, paymentRow.user_id, plan);

  await admin
    .from("payments")
    .update({ status: "succeeded", subscription_id: subscriptionId })
    .eq("id", paymentRow.id);

  const { data: user } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", paymentRow.user_id)
    .maybeSingle();
  if (user) {
    notifyTelegram(user.telegram_id, `✅ Оплата прошла — подписка «${plan.toUpperCase()}» активирована на 30 дней.`).catch(
      () => {}
    );
  }

  return NextResponse.json({ status: "activated" });
}
ENDOFFILE

mkdir -p "lib/telegram"
cat > "lib/telegram/bot.ts" << 'ENDOFFILE'
import { Bot, InlineKeyboard } from "grammy";
import { getSupportAiReply } from "@/lib/telegram/support-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscriptions/server";
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

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Отлично, теперь запустим наше МЕСТО! 🚀🧡",
      { reply_markup: openAppKeyboard() }
    );
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
cat > "lib/telegram/webapp-client.ts" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";

/**
 * Telegram инжектит объект window.Telegram.WebApp через скрипт
 * https://telegram.org/js/telegram-web-app.js (подключается в app/layout.tsx).
 * Это официальный документированный глобальный объект Mini Apps API.
 *
 * Мы читаем initData именно отсюда, а не пытаемся собрать его вручную —
 * подпись (hash) для этой строки формирует сам Telegram на своей стороне.
 *
 * Перед продакшн-использованием свериться с актуальной документацией:
 * https://core.telegram.org/bots/webapps
 */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  openInvoice: (url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  close: () => void;
  // viewportHeight — реальная видимая высота окна Mini App, которую Telegram
  // сам пересчитывает при появлении/скрытии клавиатуры. Обычный CSS
  // 100vh/100dvh внутри WebView Telegram не всегда обновляется корректно при
  // открытии клавиатуры — из-за этого и "съезжал" экран чата при наборе
  // текста. viewportChanged — событие, которое стреляет при каждом
  // изменении (в т.ч. открытии клавиатуры).
  viewportHeight: number;
  viewportStableHeight: number;
  onEvent: (eventType: "viewportChanged", callback: () => void) => void;
  offEvent: (eventType: "viewportChanged", callback: () => void) => void;
  MainButton: {
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Возвращает сырую initData-строку для отправки на backend, либо null вне Telegram. */
export function getInitData(): string | null {
  const webApp = getTelegramWebApp();
  if (!webApp || !webApp.initData) return null;
  return webApp.initData;
}

/**
 * Живая высота видимой области Mini App в пикселях — уже с учётом открытой
 * клавиатуры. Вне Telegram (например, при разработке в обычном браузере)
 * возвращает null — в этом случае экран должен сам откатиться на обычный
 * CSS h-[100dvh] как запасной вариант.
 */
export function useTelegramViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    function update() {
      setHeight(webApp!.viewportHeight);
    }

    update();
    webApp.onEvent("viewportChanged", update);
    return () => webApp.offEvent("viewportChanged", update);
  }, []);

  return height;
}
ENDOFFILE

mkdir -p "components/paywall"
cat > "components/paywall/Paywall.tsx" << 'ENDOFFILE'
"use client";

import { useState } from "react";
import { PlanCard } from "./PlanCard";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

const FEATURES: Record<Plan, string[]> = {
  start: ["До 3 встреч за период", "1 поднятие", "Весь город", "Чат после подтверждения", "Группа до 4 человек"],
  medium: [
    "До 15 встреч за период",
    "5 поднятий",
    "Расширенные фильтры",
    "Выделение встречи",
    "Закрытые встречи",
    "Группа до 10 человек",
    "Скрытие профиля",
  ],
  premium: [
    "Встречи без ограничений",
    "10 поднятий",
    "Выделение встречи",
    "Максимальный вес в рекомендациях",
    "Закрытые встречи",
    "Группа до 30 человек",
    "Скрытие профиля",
  ],
};

interface PaywallProps {
  onActivated: () => void;
}

export function Paywall({ onActivated }: PaywallProps) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [loadingCardPlan, setLoadingCardPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);

    try {
      const res = await fetch("/api/subscriptions/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();

      if (!res.ok || !data.invoiceLink) {
        setError("Не получилось открыть оплату. Попробуй ещё раз.");
        setLoadingPlan(null);
        return;
      }

      const webApp = getTelegramWebApp();
      if (!webApp) {
        setError("Открой приложение через Telegram, чтобы оплатить.");
        setLoadingPlan(null);
        return;
      }

      webApp.openInvoice(data.invoiceLink, (status) => {
        setLoadingPlan(null);
        if (status === "paid") {
          // Реальная активация подписки происходит на бэкенде после
          // successful_payment от Telegram (см. lib/telegram/bot.ts). Здесь
          // просто перепроверяем статус — к моменту колбэка обычно уже успевает отработать.
          onActivated();
        } else if (status === "failed") {
          setError("Платёж не прошёл. Попробуй ещё раз.");
        }
      });
    } catch {
      setError("Проблема с соединением.");
      setLoadingPlan(null);
    }
  }

  async function handleSelectCard(plan: Plan) {
    setLoadingCardPlan(plan);
    setError(null);

    try {
      const res = await fetch("/api/subscriptions/yookassa/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();

      if (!res.ok || !data.confirmationUrl) {
        setError("Не получилось открыть оплату. Попробуй ещё раз.");
        setLoadingCardPlan(null);
        return;
      }

      // Страница оплаты ЮKassa — не Mini App, а обычный внешний сайт,
      // открываем во встроенном браузере Telegram (openLink), а не внутри
      // самого мини-приложения. Активация подписки произойдёт по вебхуку
      // (см. app/api/webhooks/yookassa/route.ts) — когда человек вернётся
      // в приложение, статус уже должен обновиться.
      const webApp = getTelegramWebApp();
      if (webApp) {
        webApp.openLink(data.confirmationUrl);
      } else {
        window.location.href = data.confirmationUrl;
      }
      setLoadingCardPlan(null);
    } catch {
      setError("Проблема с соединением.");
      setLoadingCardPlan(null);
    }
  }

  return (
    <div className="space-y-4 px-5 py-6">
      <div className="text-center">
        <h1 className="text-display">Выбери тариф</h1>
        <p className="mt-1 text-sm text-ink-600">Чтобы создавать встречи, нужна подписка.</p>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <PlanCard
        plan="start"
        limits={PLAN_LIMITS.start}
        features={FEATURES.start}
        loading={loadingPlan === "start"}
        loadingCard={loadingCardPlan === "start"}
        onSelect={handleSelect}
        onSelectCard={handleSelectCard}
      />
      <PlanCard
        plan="medium"
        limits={PLAN_LIMITS.medium}
        features={FEATURES.medium}
        highlighted
        loading={loadingPlan === "medium"}
        loadingCard={loadingCardPlan === "medium"}
        onSelect={handleSelect}
        onSelectCard={handleSelectCard}
      />
      <PlanCard
        plan="premium"
        limits={PLAN_LIMITS.premium}
        features={FEATURES.premium}
        loading={loadingPlan === "premium"}
        loadingCard={loadingCardPlan === "premium"}
        onSelect={handleSelect}
        onSelectCard={handleSelectCard}
      />
    </div>
  );
}
ENDOFFILE

mkdir -p "components/paywall"
cat > "components/paywall/PlanCard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import type { Plan, PlanLimits } from "@/lib/subscriptions/limits";

interface PlanCardProps {
  plan: Plan;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  loading?: boolean;
  loadingCard?: boolean;
  onSelect: (plan: Plan) => void;
  onSelectCard: (plan: Plan) => void;
}

// Визуальные названия МЕСТО. Backend-идентификаторы (start/medium/premium)
// не меняются — это только отображаемый текст (см. бриф п.22).
const PLAN_TITLES: Record<Plan, string> = {
  start: "Старт",
  medium: "Медиум",
  premium: "Премьер",
};

const PLAN_VISUALS: Record<
  Plan,
  { icon: string; cardClass: string; titleClass: string; textClass: string; buttonVariant: "primary" | "secondary" }
> = {
  start: {
    icon: "/brand/3d/plan-start.png",
    cardClass: "bg-white border border-lavender-200",
    titleClass: "text-ink-900",
    textClass: "text-ink-600",
    buttonVariant: "secondary",
  },
  medium: {
    icon: "/brand/3d/plan-medium.png",
    cardClass: "bg-brand-gradient",
    titleClass: "text-white",
    textClass: "text-white/80",
    buttonVariant: "primary",
  },
  premium: {
    icon: "/brand/3d/plan-premier.png",
    cardClass: "bg-ink-900",
    titleClass: "text-white",
    textClass: "text-white/70",
    buttonVariant: "primary",
  },
};

export function PlanCard({
  plan,
  limits,
  features,
  highlighted,
  loading,
  loadingCard,
  onSelect,
  onSelectCard,
}: PlanCardProps) {
  const visual = PLAN_VISUALS[plan];

  return (
    <div className={`relative overflow-hidden rounded-card-lg p-5 shadow-card-lg ${visual.cardClass}`}>
      {highlighted && (
        <span className="absolute right-5 top-5 rounded-pill bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          Популярный
        </span>
      )}

      <div className="mb-3 flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-card-sm">
          <Image src={visual.icon} alt="" fill className="object-cover" sizes="56px" />
        </div>
        <div>
          <h3 className={`text-title ${visual.titleClass}`}>{PLAN_TITLES[plan]}</h3>
          <span className={`text-sm font-semibold ${visual.textClass}`}>{limits.priceRub} ₽/мес</span>
        </div>
      </div>

      <ul className={`mb-4 space-y-1.5 text-sm ${visual.textClass}`}>
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span>·</span>
            {feature}
          </li>
        ))}
      </ul>

      <Button variant={visual.buttonVariant} onClick={() => onSelect(plan)} disabled={loading || loadingCard}>
        {loading ? "Открываем оплату..." : `Оплатить ${limits.priceStars} ⭐`}
      </Button>
      <button
        onClick={() => onSelectCard(plan)}
        disabled={loading || loadingCard}
        className={`mt-2 w-full rounded-pill py-2.5 text-sm font-medium underline ${visual.textClass}`}
      >
        {loadingCard ? "Открываем оплату..." : "Оплатить картой / СБП"}
      </button>
    </div>
  );
}
ENDOFFILE

mkdir -p "app"
cat > "app/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { getInitData } from "@/lib/telegram/webapp-client";

/**
 * Точка входа Mini App. Ждёт initData от Telegram, вызывает /api/auth и
 * редиректит:
 *   - "authenticated"       → /feed (или на ?goto=..., см. EntryPageInner)
 *   - "needs_registration"  → /onboarding
 *   - ошибка / initData нет → показываем сообщение "открой через Telegram"
 *
 * Пока идёт проверка — показываем брендированный экран загрузки (логотип +
 * полоса загрузки + слоган), а не голый текст.
 *
 * Suspense обязателен: useSearchParams() в клиентском компоненте требует
 * границу Suspense при статической генерации страницы, иначе сборка Next.js
 * падает с ошибкой.
 */
export default function EntryPage() {
  return (
    <Suspense fallback={<SplashScreen status="loading" />}>
      <EntryPageInner />
    </Suspense>
  );
}

function EntryPageInner() {
  const [status, setStatus] = useState<"loading" | "no_telegram" | "error">("loading");
  const searchParams = useSearchParams();
  // Кнопка "Купить подписку" в боте открывает приложение с ?goto=subscriptions —
  // после обычной проверки авторизации ниже редиректим сразу туда, а не в /feed.
  const goto = searchParams.get("goto");

  useEffect(() => {
    const initData = getInitData();
    if (!initData) {
      // Небольшая задержка на случай, если telegram-web-app.js ещё не успел выполниться.
      const timeout = setTimeout(() => {
        if (!getInitData()) setStatus("no_telegram");
      }, 500);
      return () => clearTimeout(timeout);
    }

    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === "authenticated") {
          const allowedGotoPaths = new Set(["subscriptions"]);
          window.location.href = goto && allowedGotoPaths.has(goto) ? `/${goto}` : "/feed";
        } else if (res.ok && data.status === "needs_registration") {
          window.location.href = "/onboarding";
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  return <SplashScreen status={status} />;
}

function SplashScreen({ status }: { status: "loading" | "no_telegram" | "error" }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <div className="relative h-[75px] w-[220px]">
        <Image src="/brand/logo/mesto-logo-3d.png" alt="МЕСТО" fill className="object-contain" priority />
      </div>

      {status === "loading" && (
        <>
          <div className="h-1.5 w-48 overflow-hidden rounded-pill bg-lavender-100">
            <div className="splash-progress-bar h-full rounded-pill bg-brand-gradient" />
          </div>
          <span className="relative block h-[29px] w-[220px]">
            <Image
              src="/brand/logo/mesto-tagline.svg"
              alt="Когда есть куда пойти, но не с кем"
              fill
              className="object-contain"
            />
          </span>
        </>
      )}

      {status === "no_telegram" && (
        <p className="max-w-[280px] text-sm text-ink-600">
          Это приложение открывается только внутри Telegram. Открой его через кнопку в боте.
        </p>
      )}

      {status === "error" && (
        <p className="max-w-[280px] text-sm text-ink-600">
          Что-то пошло не так. Попробуй закрыть и открыть приложение снова.
        </p>
      )}
    </div>
  );
}
ENDOFFILE

