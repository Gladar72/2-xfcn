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
