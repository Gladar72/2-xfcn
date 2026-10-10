"use client";

import { useEffect, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import { Ic, Screen } from "@/components/proto/ui";
import { useRouter } from "next/navigation";
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

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };
const PLAN_ICON: Record<Plan, string> = {
  start: "/brand/mosya/mosya_jump.webp",
  medium: "/brand/mosya/mosya_jump.webp",
  premium: "/brand/mosya/mosya_jump.webp",
};

/**
 * Экран, на который ведут две 3D-монеты в нижней навигации (см. бриф п.18-20).
 * Если подписки нет — показываем выбор тарифа (Paywall).
 * Если подписка есть — показываем "Мой тариф" со статистикой использования
 * и возможностью сменить тариф.
 */
export default function SubscriptionsPage() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  useGuide("subscriptions");
  const [changingPlan, setChangingPlan] = useState(false);
  const router = useRouter();

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

  if (!status?.active || changingPlan) {
    return (
      <Paywall
        onActivated={() => {
          setChangingPlan(false);
          load();
        }}
      />
    );
  }

  const plan = status.plan!;
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");
  const rows: [string, number, number | null][] = [
    ["Встречи", status.events?.used ?? 0, status.events?.limit ?? null],
    ["Поднятия", status.boosts?.used ?? 0, status.boosts?.limit ?? null],
  ];

  return (
    <Screen id="tariff" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => (window.history.length > 1 ? router.back() : router.push("/profile"))} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Мой <em>тариф</em>
      </h1>
      <div className="subc" style={{ cursor: "default" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PLAN_ICON[plan]} alt="" />
        <small>Текущий тариф · активен</small>
        <b>{PLAN_TITLES[plan]}</b>
        <span>{status.periodStart ? `${fmt(status.periodStart)} — ${fmt(status.periodEnd)}` : `до ${fmt(status.periodEnd)}`}</span>
      </div>
      <div className="usage gl">
        {rows.map(([n, used, limit]) => (
          <div key={n}>
            <div>
              <b>{n}</b>
              <span>{limit == null ? `${used} · без лимита` : `${used} из ${limit}`}</span>
            </div>
            <span className="bar2">
              <i style={{ width: limit ? `${Math.min(100, (used / limit) * 100)}%` : "8%" }} />
            </span>
          </div>
        ))}
        <small className="muted">Поднятие ставит встречу в начало ленты</small>
      </div>
      <button className="btn v" style={{ marginTop: 14 }} onClick={() => setChangingPlan(true)}>
        Сменить тариф
      </button>
    </Screen>
  );
}
