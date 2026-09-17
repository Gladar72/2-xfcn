mkdir -p "lib/telegram"
cat > "lib/telegram/bot.ts" << 'ENDOFFILE'
import { Bot, InlineKeyboard, Keyboard } from "grammy";
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
  function persistentKeyboard(isAdmin: boolean) {
    const kb = new Keyboard()
      .webApp("Открыть приложение", validatedAppUrl)
      .row()
      .webApp("Купить подписку", `${validatedAppUrl}?goto=subscriptions`);
    if (isAdmin) {
      kb.row().webApp("📊 Админ-панель", `${validatedAppUrl}?goto=admin`);
    }
    return kb.resized();
  }

  bot.command("start", async (ctx) => {
    await ctx.reply("Отлично, теперь запустим наше МЕСТО! 🚀🧡", {
      reply_markup: persistentKeyboard(isAdminTelegramId(ctx.from?.id ?? 0)),
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
          const allowedGotoPaths = new Set(["subscriptions", "admin"]);
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
      <div className="relative h-[180px] w-[180px]">
        <Image src="/brand/logo/mesto-mascot.png" alt="МЕСТО" fill className="object-contain" priority />
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

mkdir -p "app/api/admin/metrics"
cat > "app/api/admin/metrics/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/metrics
 * Сводка для главного экрана admin dashboard (п.29 ТЗ).
 *
 * Честное ограничение: DAU в строгом смысле (уникальные пользователи,
 * реально открывшие приложение сегодня) требует отдельного пайплайна
 * событий — это Этап 34 (аналитика). Пока используем более грубую метрику
 * "новых регистраций за периоды", а DAU помечаем как "недоступно" —
 * лучше явно показать это, чем подсунуть придуманное число.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createAdminClient();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonthIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: newUsers7d },
    { count: bannedUsers },
    { count: totalEvents },
    { count: completedEvents },
    { count: totalApplications },
    { count: acceptedApplications },
    { data: activeSubscriptions },
    { count: totalSubscriptionsEver },
    { data: payments },
    { count: pendingReports },
    { data: reviewRatings },
  ] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }),
    db.from("users").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
    db.from("users").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    db.from("users").select("*", { count: "exact", head: true }).eq("moderation_status", "banned"),
    db.from("events").select("*", { count: "exact", head: true }),
    db.from("events").select("*", { count: "exact", head: true }).eq("status", "completed"),
    db.from("applications").select("*", { count: "exact", head: true }),
    db.from("applications").select("*", { count: "exact", head: true }).eq("status", "accepted"),
    db.from("subscriptions").select("plan").eq("status", "active"),
    // "Сколько оформлено подписок" — за всё время, не только сейчас
    // активные (та цифра выше, в planCounts) — иначе не видно ни сколько
    // всего когда-либо купили, ни какая доля из них продлевается/уходит.
    db.from("subscriptions").select("*", { count: "exact", head: true }),
    db.from("payments").select("amount, currency, status, created_at"),
    db.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("reviews").select("rating"),
  ]);

  const planCounts = { start: 0, medium: 0, premium: 0 };
  for (const sub of activeSubscriptions ?? []) {
    if (sub.plan in planCounts) planCounts[sub.plan as keyof typeof planCounts]++;
  }

  // Рубли (ЮKassa) и Telegram Stars — РАЗНЫЕ валюты, их нельзя складывать
  // в одну сумму (раньше здесь так и было — revenueStars фактически
  // смешивал рубли и звёзды в одно бессмысленное число). Считаем отдельно.
  const succeededPayments = (payments ?? []).filter((p) => p.status === "succeeded");
  const succeededThisMonth = succeededPayments.filter((p) => p.created_at >= startOfMonthIso);
  function sumByCurrency(rows: typeof succeededPayments, currency: string): number {
    return rows.filter((p) => p.currency === currency).reduce((sum, p) => sum + p.amount, 0);
  }

  const avgRating =
    reviewRatings && reviewRatings.length > 0
      ? reviewRatings.reduce((sum, r) => sum + r.rating, 0) / reviewRatings.length
      : null;

  return NextResponse.json({
    users: { total: totalUsers ?? 0, newToday: newUsersToday ?? 0, new7d: newUsers7d ?? 0, banned: bannedUsers ?? 0 },
    dau: null, // см. комментарий выше
    events: { total: totalEvents ?? 0, completed: completedEvents ?? 0 },
    applications: {
      total: totalApplications ?? 0,
      accepted: acceptedApplications ?? 0,
      conversionRate: totalApplications ? (acceptedApplications ?? 0) / totalApplications : 0,
    },
    subscriptions: { active: planCounts, totalEverPurchased: totalSubscriptionsEver ?? 0 },
    payments: {
      succeededCount: succeededPayments.length,
      succeededCountThisMonth: succeededThisMonth.length,
      revenueRub: sumByCurrency(succeededPayments, "RUB"),
      revenueRubThisMonth: sumByCurrency(succeededThisMonth, "RUB"),
      revenueStars: sumByCurrency(succeededPayments, "XTR"),
      revenueStarsThisMonth: sumByCurrency(succeededThisMonth, "XTR"),
    },
    reports: { pending: pendingReports ?? 0 },
    reviews: { avgRating, count: reviewRatings?.length ?? 0 },
  });
}
ENDOFFILE

mkdir -p "app/admin"
cat > "app/admin/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";

interface Metrics {
  users: { total: number; newToday: number; new7d: number; banned: number };
  dau: null;
  events: { total: number; completed: number };
  applications: { total: number; accepted: number; conversionRate: number };
  subscriptions: { active: { start: number; medium: number; premium: number }; totalEverPurchased: number };
  payments: {
    succeededCount: number;
    succeededCountThisMonth: number;
    revenueRub: number;
    revenueRubThisMonth: number;
    revenueStars: number;
    revenueStarsThisMonth: number;
  };
  reports: { pending: number };
  reviews: { avgRating: number | null; count: number };
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => r.json())
      .then(setMetrics);
  }, []);

  if (!metrics) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card label="Всего пользователей" value={metrics.users.total} />
      <Card label="Новых сегодня" value={metrics.users.newToday} />
      <Card label="Новых за 7 дней" value={metrics.users.new7d} />
      <Card label="Забанено" value={metrics.users.banned} />

      <Card label="Всего встреч" value={metrics.events.total} />
      <Card label="Завершено встреч" value={metrics.events.completed} />
      <Card label="Откликов" value={metrics.applications.total} />
      <Card
        label="Конверсия отклик → принят"
        value={`${Math.round(metrics.applications.conversionRate * 100)}%`}
      />

      <Card label="Подписок оформлено всего" value={metrics.subscriptions.totalEverPurchased} />
      <Card label="START (сейчас активно)" value={metrics.subscriptions.active.start} />
      <Card label="MEDIUM (сейчас активно)" value={metrics.subscriptions.active.medium} />
      <Card label="PREMIUM (сейчас активно)" value={metrics.subscriptions.active.premium} />

      <Card label="Выручка ₽ (всего)" value={`${metrics.payments.revenueRub.toLocaleString("ru-RU")} ₽`} />
      <Card
        label="Выручка ₽ (этот месяц)"
        value={`${metrics.payments.revenueRubThisMonth.toLocaleString("ru-RU")} ₽`}
      />
      <Card label="Выручка Stars (всего)" value={metrics.payments.revenueStars} />
      <Card label="Успешных платежей" value={metrics.payments.succeededCount} hint={`${metrics.payments.succeededCountThisMonth} в этом месяце`} />

      <Card label="Жалоб в ожидании" value={metrics.reports.pending} />
      <Card
        label="Средняя оценка встреч"
        value={metrics.reviews.avgRating !== null ? metrics.reviews.avgRating.toFixed(2) : "—"}
        hint={`${metrics.reviews.count} отзывов`}
      />
      <Card label="DAU" value="—" hint="нужна аналитика, Этап 34" />
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <p className="text-xs text-ink-600">{label}</p>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}
ENDOFFILE

mkdir -p "app/admin/subscriptions"
cat > "app/admin/subscriptions/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";

export default function AdminSubscriptionsPage() {
  const [counts, setCounts] = useState<{ start: number; medium: number; premium: number } | null>(null);
  const [totalEver, setTotalEver] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => r.json())
      .then((data) => {
        setCounts(data.subscriptions.active);
        setTotalEver(data.subscriptions.totalEverPurchased);
      });
  }, []);

  if (!counts) return <p className="text-ink-600">Загрузка...</p>;

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-sm text-ink-600">
        Оформлено подписок за всё время: <span className="font-semibold text-ink-900">{totalEver}</span>
      </p>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-card bg-white p-4 text-center shadow-card">
          <p className="text-xs text-ink-600">START</p>
          <p className="text-2xl font-bold">{counts.start}</p>
        </div>
        <div className="rounded-card bg-white p-4 text-center shadow-card">
          <p className="text-xs text-ink-600">MEDIUM</p>
          <p className="text-2xl font-bold">{counts.medium}</p>
        </div>
        <div className="rounded-card bg-white p-4 text-center shadow-card">
          <p className="text-xs text-ink-600">PREMIUM</p>
          <p className="text-2xl font-bold">{counts.premium}</p>
        </div>
      </div>
    </div>
  );
}
ENDOFFILE

