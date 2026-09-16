mkdir -p "lib/subscriptions"
cat > "lib/subscriptions/limits.ts" << 'ENDOFFILE'
export type Plan = "start" | "medium" | "premium";

export interface PlanLimits {
  eventsLimit: number | null; // null = без ограничений (PREMIUM) — лимит на СОЗДАНИЕ встреч
  applicationsLimit: number | null; // null = без ограничений — лимит на УЧАСТИЕ (отклики на чужие встречи)
  boostLimit: number;
  groupMax: number;
  priceRub: number;
  /**
   * Цена в Telegram Stars (XTR). Курс Stars к рублю периодически меняется
   * на стороне Telegram — эти значения ПРИБЛИЗИТЕЛЬНЫЕ и требуют сверки
   * с актуальным курсом перед запуском в продакшн (см. lib/telegram/bot-api.ts).
   */
  priceStars: number;
  rankingCoefficient: number; // используется в lib/scoring/rank-events.ts
}

/**
 * Лимит на участие (отклики) для пользователя БЕЗ какой-либо подписки —
 * единственный лимит во всём приложении, который не завязан на тариф.
 */
export const FREE_APPLICATIONS_LIMIT = 4;

/**
 * Единственное место, где живут лимиты и цены тарифов (п.12, п.26 ТЗ).
 * Меняешь тариф здесь — меняется везде: в paywall, в проверках API, в ranking.
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  start: {
    eventsLimit: 3,
    applicationsLimit: 15,
    boostLimit: 1,
    groupMax: 4,
    priceRub: 299,
    priceStars: 150,
    rankingCoefficient: 0,
  },
  medium: {
    eventsLimit: 15,
    applicationsLimit: 30,
    boostLimit: 5,
    groupMax: 10,
    priceRub: 599,
    priceStars: 300,
    rankingCoefficient: 3,
  },
  premium: {
    eventsLimit: null,
    applicationsLimit: null,
    boostLimit: 10,
    groupMax: 30,
    priceRub: 999,
    priceStars: 500,
    rankingCoefficient: 6,
  },
};

export function canCreateMoreEvents(plan: Plan, eventsCreatedInPeriod: number): boolean {
  const limit = PLAN_LIMITS[plan].eventsLimit;
  if (limit === null) return true;
  return eventsCreatedInPeriod < limit;
}

/**
 * plan === null означает пользователя без активной подписки вообще —
 * тогда используется FREE_APPLICATIONS_LIMIT, а не лимит какого-то тарифа.
 */
export function canApplyToMoreEvents(plan: Plan | null, applicationsUsedInPeriod: number): boolean {
  const limit = plan === null ? FREE_APPLICATIONS_LIMIT : PLAN_LIMITS[plan].applicationsLimit;
  if (limit === null) return true;
  return applicationsUsedInPeriod < limit;
}

export function canUseBoost(plan: Plan, boostsUsedInPeriod: number): boolean {
  return boostsUsedInPeriod < PLAN_LIMITS[plan].boostLimit;
}
ENDOFFILE

mkdir -p "app/api/applications"
cat > "app/api/applications/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { canApplyToMoreEvents, FREE_APPLICATIONS_LIMIT } from "@/lib/subscriptions/limits";

const APPLICATIONS_PERIOD_DAYS = 30;

/**
 * POST /api/applications
 * Body: { eventId: string }
 *
 * Отклик на встречу (кнопка "Хочу пойти", п.13 ТЗ). Лимит на КОЛИЧЕСТВО
 * откликов за 30 дней — свой для каждого тарифа (и отдельный
 * FREE_APPLICATIONS_LIMIT для тех, у кого нет подписки вообще), задаётся
 * в lib/subscriptions/limits.ts. Отдельно от лимита на СОЗДАНИЕ встреч.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id, status, seats_total, seats_taken")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.status !== "published") {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  if (event.organizer_id === currentUser.userId) {
    return NextResponse.json({ error: "cannot_apply_to_own_event" }, { status: 422 });
  }

  if (event.seats_taken >= event.seats_total) {
    return NextResponse.json({ error: "event_full" }, { status: 409 });
  }

  const { data: blocked } = await admin.rpc("is_blocked_pair", {
    user_a: currentUser.userId,
    user_b: event.organizer_id,
  });
  if (blocked) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }

  if (!isAdminTelegramId(currentUser.telegramId)) {
    const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
    const periodStart = new Date(Date.now() - APPLICATIONS_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { count: applicationsUsedInPeriod } = await admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .gte("created_at", periodStart);

    if (!canApplyToMoreEvents(subscriptionInfo?.plan ?? null, applicationsUsedInPeriod ?? 0)) {
      return NextResponse.json(
        {
          error: "applications_limit_reached",
          limit: subscriptionInfo ? undefined : FREE_APPLICATIONS_LIMIT,
        },
        { status: 403 }
      );
    }
  }

  const { data: application, error: insertError } = await admin
    .from("applications")
    .insert({ event_id: eventId, user_id: currentUser.userId, status: "pending" })
    .select("id")
    .single();

  if (insertError) {
    // unique constraint (event_id, user_id) — уже откликался
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_applied" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: event.organizer_id,
    type: "new_application",
    payload: { eventId, applicationId: application.id, applicantId: currentUser.userId },
  });

  const { data: organizer } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", event.organizer_id)
    .maybeSingle();
  if (organizer) {
    notifyTelegram(organizer.telegram_id, buildNotificationText("new_application", event.title)).catch(() => {});
  }

  return NextResponse.json({ status: "created", applicationId: application.id });
}
ENDOFFILE

mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

interface EventDetailsPageProps {
  // Next.js 14 (в этом проекте) — params плоский объект, НЕ Promise.
  // См. пояснение в app/chats/[id]/page.tsx про баг с use(params).
  params: { id: string };
}

const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export default function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Встреча не найдена.");
          return;
        }
        setEvent(data);
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "event_full"
            ? "Мест больше нет."
            : data.error === "cannot_apply_to_own_event"
              ? "Это твоя собственная встреча."
              : data.error === "applications_limit_reached"
                ? "Лимит откликов на встречи по твоему тарифу исчерпан за этот период — загляни в раздел «Подписка», чтобы поднять лимит."
                : "Не получилось отправить отклик."
        );
        return;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        setEvent((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setConfirmingCancel(false);
      } else {
        setError("Не получилось отменить встречу.");
      }
    } finally {
      setCancelling(false);
    }
  }

  async function handleBoost() {
    setBoosting(true);
    setBoostMessage(null);
    try {
      const res = await fetch("/api/boosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoostMessage(
          data.error === "subscription_required"
            ? "Нужна подписка, чтобы поднимать встречи."
            : data.error === "boost_limit_reached"
              ? "Лимит подъёмов на этот месяц исчерпан."
              : "Не получилось поднять встречу."
        );
        return;
      }
      setBoostMessage(
        data.boostsLimit != null
          ? `Встреча поднята! Использовано ${data.boostsUsed} из ${data.boostsLimit} в этом месяце.`
          : "Встреча поднята!"
      );
    } finally {
      setBoosting(false);
      setTimeout(() => setBoostMessage(null), 4000);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/feed" className="text-sm font-medium text-accent">
          Вернуться на главную
        </Link>
      </div>
    );
  }
  if (!event) return null;

  const categoryLabel = event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;

  return (
    <div className="pb-28">
      <div className="flex items-center gap-3 px-5 pt-4">
        <button onClick={() => router.back()} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-accent">
          {categoryIcon ? (
            <div className="relative h-5 w-5 shrink-0">
              <Image src={categoryIcon} alt="" fill className="object-contain" sizes="20px" />
            </div>
          ) : (
            <span>{event.category?.emoji}</span>
          )}
          <span>{categoryLabel}</span>
        </div>

        <h1 className="text-display mb-3">{event.title}</h1>

        <div className="mb-4 space-y-1.5 text-sm text-ink-600">
          <p>
            {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
          </p>
          {event.placeName && (
            <p>
              {event.placeName}
              {event.address ? `, ${event.address}` : ""}
            </p>
          )}
          <p>{isFull ? "Мест нет" : `Свободно мест: ${seatsLeft} из ${event.seatsTotal}`}</p>
        </div>

        {event.participants.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {event.participants.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
                >
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </div>
              ))}
            </div>
            <span className="text-xs text-ink-600">
              {event.participants.length} {pluralizeParticipants(event.participants.length)}
            </span>
          </div>
        )}

        {event.description && <p className="mb-5 text-sm text-ink-900">{event.description}</p>}

        {event.organizer && (
          <div className="mb-5 flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
              {event.organizer.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.organizer.avatarUrl} alt={event.organizer.name} className="h-full w-full object-cover" />
              ) : (
                event.organizer.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">
                {event.organizer.name}, {event.organizer.age}
              </p>
              <p className="text-xs text-ink-600">
                {event.organizer.ratingAvg > 0 ? `⭐ ${event.organizer.ratingAvg.toFixed(1)} · ` : ""}
                {event.organizer.completedMeetingsCount} встреч проведено
              </p>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        {event.status === "cancelled" && (
          <div className="mb-3 rounded-card bg-red-50 p-4 text-center text-sm text-red-600">
            Эта встреча отменена организатором.
          </div>
        )}

        {event.viewerStatus === "organizer" && event.status === "published" && (
          <div className="mb-3 space-y-3">
            <button
              onClick={handleBoost}
              disabled={boosting}
              className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-gradient py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-60"
            >
              <span className="text-lg">🚀</span>
              {boosting ? "Поднимаем..." : "Поднять встречу"}
            </button>
            {boostMessage && <p className="text-center text-xs text-ink-600">{boostMessage}</p>}

            {!confirmingCancel ? (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="w-full text-center text-sm font-medium text-red-600"
              >
                Отменить встречу
              </button>
            ) : (
              <div className="rounded-card bg-red-50 p-4 text-center">
                <p className="mb-3 text-sm text-ink-900">Точно отменить встречу? Лимит тарифа вернётся.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 rounded-pill bg-white py-2.5 text-sm font-medium text-ink-600 shadow-card"
                  >
                    Не отменять
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 rounded-pill bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Отменяем..." : "Да, отменить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {event.status === "published" && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-5">
          <BottomAction
            viewerStatus={event.viewerStatus}
            isFull={isFull}
            applying={applying}
            onApply={handleApply}
            eventId={event.id}
          />
        </div>
      )}
    </div>
  );
}

function BottomAction({
  viewerStatus,
  isFull,
  applying,
  onApply,
  eventId,
}: {
  viewerStatus: EventDetails["viewerStatus"];
  isFull: boolean;
  applying: boolean;
  onApply: () => void;
  eventId: string;
}) {
  if (viewerStatus === "organizer") {
    return (
      <Link
        href={`/events/${eventId}/applications`}
        className="block w-full rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta"
      >
        Управлять заявками
      </Link>
    );
  }
  if (viewerStatus === "accepted") {
    return (
      <div className="w-full rounded-pill bg-ink-900 py-4 text-center text-base font-semibold text-white">
        Ты идёшь ✓
      </div>
    );
  }
  if (viewerStatus === "pending") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-600">
        Отклик отправлен
      </div>
    );
  }
  if (viewerStatus === "rejected") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-400">
        Отклонено
      </div>
    );
  }

  return (
    <button
      onClick={onApply}
      disabled={isFull || applying}
      className="w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40"
    >
      {isFull ? "Мест нет" : applying ? "Отправляем..." : "Я иду"}
    </button>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pluralizeParticipants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек идёт";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "человека идут";
  return "человек идут";
}
ENDOFFILE

mkdir -p "components/paywall"
cat > "components/paywall/Paywall.tsx" << 'ENDOFFILE'
"use client";

import { useState } from "react";
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

  // Оплата Telegram Stars временно скрыта из интерфейса (карта/СБП —
  // единственный видимый способ сейчас) — сам API (/api/subscriptions/create-invoice)
  // и обработка оплаты в lib/telegram/bot.ts не тронуты, можно вернуть кнопку позже.
  // onActivated (колбэк успешной оплаты) относился к Stars-потоку внутри
  // Mini App; для ЮKassa активация приходит асинхронно через вебхук, пока
  // человек на внешней странице оплаты — родительский экран сам
  // перезапрашивает статус подписки при возврате.
  void onActivated;

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
    </div>
  );
}
ENDOFFILE

