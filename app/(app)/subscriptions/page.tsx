"use client";

import { useEffect, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import { Screen } from "@/components/proto/ui";
import { Paywall } from "@/components/paywall/Paywall";
import { type Plan } from "@/lib/subscriptions/limits";

interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodStart?: string;
  periodEnd?: string;
  events?: { used: number; limit: number | null };
  boosts?: { used: number; limit: number };
}

/**
 * «Выбери тариф» (как в прототипе): все тарифы на одном экране,
 * действующий отмечен «Текущий», им же можно продлить. Использование
 * лимитов видно в профиле (полоска на карточке тарифа).
 */
export default function SubscriptionsPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  useGuide("subscriptions");

  function load() {
    setLoading(true);
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then(setStatus)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Screen id="tariff">
        <div className="sk" style={{ height: 150, marginTop: 70, borderRadius: 26 }} />
      </Screen>
    );
  }

  // Как в прототипе: один экран «Выбери тариф», действующий отмечен «Текущий».
  return (
    <Paywall
      current={status?.active && status.plan ? { plan: status.plan, periodEnd: status.periodEnd } : null}
      onActivated={load}
    />
  );
}
