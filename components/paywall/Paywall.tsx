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
