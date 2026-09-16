mkdir -p "app/api/me/profile"
cat > "app/api/me/profile/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";

/**
 * GET /api/me/profile
 * Полный профиль текущего пользователя — для экрана "Профиль" (п.21 ТЗ).
 * Отдельно от /api/me (который отдаёт только userId для чата), чтобы не
 * тащить лишние данные туда, где нужен просто идентификатор.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select(
      "id, name, avatar_url, birth_date, city, bio, rating_avg, rating_count, completed_meetings_count, created_at, receipt_contact"
    )
    .eq("id", currentUser.userId)
    .maybeSingle();

  if (error || !user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ count: eventsOrganizedCount }, { count: eventsAttendedCount }] = await Promise.all([
    admin.from("events").select("*", { count: "exact", head: true }).eq("organizer_id", currentUser.userId),
    admin
      .from("event_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .eq("role", "participant"),
  ]);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    age: calculateAge(user.birth_date),
    city: user.city,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    ratingCount: user.rating_count,
    completedMeetingsCount: user.completed_meetings_count,
    receiptContact: user.receipt_contact,
    eventsOrganizedCount: eventsOrganizedCount ?? 0,
    eventsAttendedCount: eventsAttendedCount ?? 0,
    memberSince: user.created_at,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * PATCH /api/me/profile
 * Body: { name?: string, bio?: string, city?: string }
 * Смена города — только из фиксированного списка городов России
 * (lib/data/russian-cities.ts), как и везде в приложении, где выбирается
 * город (поиск, лента) — иначе рассинхронизация с фильтрами по городу.
 */
export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const update: Record<string, string> = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 50) {
      return NextResponse.json({ error: "invalid_name" }, { status: 422 });
    }
    update.name = name;
  }

  if (typeof body?.bio === "string") {
    const bio = body.bio.trim();
    if (bio.length > 300) return NextResponse.json({ error: "bio_too_long" }, { status: 422 });
    update.bio = bio;
  }

  if (typeof body?.city === "string") {
    if (!RUSSIAN_CITIES.includes(body.city)) {
      return NextResponse.json({ error: "invalid_city" }, { status: 422 });
    }
    update.city = body.city;
  }

  if (typeof body?.receiptContact === "string") {
    const contact = body.receiptContact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\+?\d{10,15}$/.test(contact.replace(/[\s()-]/g, ""));
    if (!isEmail && !isPhone) {
      return NextResponse.json({ error: "invalid_receipt_contact" }, { status: 422 });
    }
    update.receipt_contact = isPhone ? contact.replace(/[\s()-]/g, "") : contact;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update(update).eq("id", currentUser.userId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
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
  /** Email или телефон покупателя — куда ЮKassa отправит электронный чек. */
  contact: string;
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
 * на страницу оплаты (человек сам выбирает способ — карта, СБП и т.д.,
 * общий экран выбора ЮKassa). Idempotence-Key — обязательный для ЮKassa
 * заголовок, защищает от повторного списания при случайном повторе
 * запроса (например, если ответ потерялся по сети и клиент отправил
 * запрос ещё раз).
 *
 * receipt — обязателен по 54-ФЗ (онлайн-касса): без него ЮKassa отклоняет
 * платёж с ошибкой "Receipt is missing or illegal". vat_code: 1 — "без
 * НДС", корректно для ИП на УСН. customer — реальный email/телефон
 * покупателя (params.contact), которые он вводит перед оплатой — чек
 * приходит именно ему, а не оператору.
 */
export async function createYooKassaPayment(params: CreatePaymentParams): Promise<YooKassaPayment> {
  const idempotenceKey = crypto.randomUUID();
  const isEmail = params.contact.includes("@");

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
      receipt: {
        customer: isEmail ? { email: params.contact } : { phone: params.contact },
        items: [
          {
            description: params.description.slice(0, 128),
            quantity: "1.00",
            amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
            vat_code: 1,
            payment_mode: "full_payment",
            payment_subject: "service",
          },
        ],
      },
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
 * Body: { plan: "start" | "medium" | "premium", contact?: string }
 *
 * contact — email или телефон покупателя, куда уйдёт электронный чек
 * (54-ФЗ). Если не передан — берём ранее сохранённый (users.receipt_contact);
 * если передан — сохраняем его на будущее, чтобы не спрашивать снова.
 * Если контакта нет вообще нигде — просим ввести (contact_required).
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

  let contact = typeof body?.contact === "string" ? body.contact.trim() : undefined;
  if (contact) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\+?\d{10,15}$/.test(contact.replace(/[\s()-]/g, ""));
    if (!isEmail && !isPhone) return NextResponse.json({ error: "invalid_contact" }, { status: 422 });
    contact = isPhone ? contact.replace(/[\s()-]/g, "") : contact;
    await admin.from("users").update({ receipt_contact: contact }).eq("id", user.userId);
  } else {
    const { data: existing } = await admin
      .from("users")
      .select("receipt_contact")
      .eq("id", user.userId)
      .maybeSingle();
    contact = existing?.receipt_contact ?? undefined;
  }

  if (!contact) {
    return NextResponse.json({ error: "contact_required" }, { status: 422 });
  }

  try {
    const payment = await createYooKassaPayment({
      userId: user.userId,
      plan,
      amountRub: limits.priceRub,
      description: `${PLAN_TITLES[plan]} на 30 дней`,
      returnUrl: `${appUrl}/subscriptions?paid=1`,
      contact,
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

mkdir -p "components/paywall"
cat > "components/paywall/Paywall.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { PlanCard } from "./PlanCard";
import { PLAN_LIMITS, FREE_APPLICATIONS_LIMIT, type Plan } from "@/lib/subscriptions/limits";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

const FEATURES: Record<Plan, string[]> = {
  start: [
    "До 3 встреч за период",
    "Участие до 15 встреч за период",
    "1 поднятие",
    "Весь город",
    "Чат после подтверждения",
    "Группа до 4 человек",
  ],
  medium: [
    "До 15 встреч за период",
    "Участие до 30 встреч за период",
    "5 поднятий",
    "Расширенные фильтры",
    "Выделение встречи",
    "Закрытые встречи",
    "Группа до 10 человек",
    "Скрытие профиля",
  ],
  premium: [
    "Встречи без ограничений",
    "Участие без ограничений",
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
  const [loadingCardPlan, setLoadingCardPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptContact, setReceiptContact] = useState<string | null | undefined>(undefined); // undefined = ещё загружаем
  const [contactPromptPlan, setContactPromptPlan] = useState<Plan | null>(null);
  const [contactDraft, setContactDraft] = useState("");

  // Оплата Telegram Stars временно скрыта из интерфейса (карта/СБП —
  // единственный видимый способ сейчас) — сам API (/api/subscriptions/create-invoice)
  // и обработка оплаты в lib/telegram/bot.ts не тронуты, можно вернуть кнопку позже.
  // onActivated (колбэк успешной оплаты) относился к Stars-потоку внутри
  // Mini App; для ЮKassa активация приходит асинхронно через вебхук, пока
  // человек на внешней странице оплаты — родительский экран сам
  // перезапрашивает статус подписки при возврате.
  void onActivated;

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => setReceiptContact(data.receiptContact ?? null))
      .catch(() => setReceiptContact(null));
  }, []);

  async function startPayment(plan: Plan, contact?: string) {
    setLoadingCardPlan(plan);
    setError(null);

    try {
      const res = await fetch("/api/subscriptions/yookassa/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact ? { plan, contact } : { plan }),
      });
      const data = await res.json();

      if (!res.ok || !data.confirmationUrl) {
        setError(
          data.error === "invalid_contact"
            ? "Введи корректный email или номер телефона."
            : "Не получилось открыть оплату. Попробуй ещё раз."
        );
        setLoadingCardPlan(null);
        return;
      }

      if (contact) setReceiptContact(contact);
      setContactPromptPlan(null);
      setContactDraft("");

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

  function handleSelectCard(plan: Plan) {
    // Чек по 54-ФЗ уходит на email/телефон покупателя — спрашиваем один
    // раз, дальше используем сохранённый контакт без повторных вопросов.
    if (receiptContact) {
      startPayment(plan);
    } else {
      setError(null);
      setContactPromptPlan(plan);
    }
  }

  return (
    <div className="space-y-4 px-5 py-6">
      <div className="text-center">
        <h1 className="text-display">Выбери тариф</h1>
        <p className="mt-1 text-sm text-ink-600">Чтобы создавать встречи, нужна подписка.</p>
        <p className="mt-1 text-xs text-ink-400">
          Без подписки можно откликаться на встречи — до {FREE_APPLICATIONS_LIMIT} за период.
        </p>
        <p className="mt-2 inline-block rounded-pill bg-lavender-100 px-3 py-1 text-xs font-medium text-accent">
          Оплата картой / СБП
        </p>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <PlanCard
        plan="start"
        limits={PLAN_LIMITS.start}
        features={FEATURES.start}
        loadingCard={loadingCardPlan === "start"}
        onSelectCard={handleSelectCard}
      />
      <PlanCard
        plan="medium"
        limits={PLAN_LIMITS.medium}
        features={FEATURES.medium}
        highlighted
        loadingCard={loadingCardPlan === "medium"}
        onSelectCard={handleSelectCard}
      />
      <PlanCard
        plan="premium"
        limits={PLAN_LIMITS.premium}
        features={FEATURES.premium}
        loadingCard={loadingCardPlan === "premium"}
        onSelectCard={handleSelectCard}
      />

      {contactPromptPlan && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
          onClick={() => setContactPromptPlan(null)}
        >
          <div className="rounded-t-sheet bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-2">Куда прислать чек?</h2>
            <p className="mb-4 text-sm text-ink-600">
              По закону об онлайн-кассах чек нужно отправить на email или телефон — укажи один раз, дальше не
              будем спрашивать.
            </p>
            <input
              value={contactDraft}
              onChange={(e) => setContactDraft(e.target.value)}
              placeholder="email или телефон"
              className="w-full rounded-pill border border-lavender-200 bg-background px-4 py-3 text-base outline-none focus:border-accent"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={() => contactPromptPlan && startPayment(contactPromptPlan, contactDraft.trim())}
              disabled={!contactDraft.trim() || loadingCardPlan !== null}
              className="mt-4 w-full rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
            >
              {loadingCardPlan ? "Открываем оплату..." : "Продолжить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE

