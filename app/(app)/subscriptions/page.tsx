"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  start: "/brand/3d/plan-start.png",
  medium: "/brand/3d/plan-medium.png",
  premium: "/brand/3d/plan-premier.png",
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
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (!status?.active || changingPlan) {
    return <Paywall onActivated={() => { setChangingPlan(false); load(); }} />;
  }

  const plan = status.plan!;
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");

  return (
    <div className="px-4 pb-8 pt-4">
      {/* Заголовок со стрелкой назад */}
      <div className="mb-5 flex items-center gap-4">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/profile"))}
          aria-label="Назад"
          className="-ml-1 flex h-10 w-8 items-center justify-center text-ink-900"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-display text-ink-900">Мой тариф</h1>
      </div>

      {/* Карточка текущего тарифа */}
      <div className="relative mb-7 overflow-hidden rounded-card-lg bg-white p-5 shadow-card">
        <div className="pointer-events-none absolute -right-2 top-2 h-[140px] w-[140px]" aria-hidden>
          <div className="absolute inset-6 rounded-full bg-accent/20 blur-2xl" />
          <Image src={PLAN_ICON[plan]} alt="" fill className="object-contain" sizes="140px" priority />
        </div>
        <span className="inline-block rounded-full bg-lavender-100 px-4 py-1.5 text-sm font-semibold text-accent">
          Текущий тариф
        </span>
        <h2 className="mt-3 text-[44px] font-black leading-none text-ink-900">{PLAN_TITLES[plan]}</h2>
        <p className="mt-3 flex items-center gap-2 text-base text-ink-600">
          <span className="h-3 w-3 rounded-full bg-gradient-to-br from-[#8A5CFF] to-accent" aria-hidden />
          Активен
        </p>
        <div className="my-4 h-px bg-lavender-200" />
        <p className="text-sm text-ink-400">Период подписки</p>
        <p className="mt-1 text-base font-medium text-ink-900">
          {status.periodStart ? `${fmt(status.periodStart)} — ${fmt(status.periodEnd)}` : `до ${fmt(status.periodEnd)}`}
        </p>
      </div>

      <h2 className="mb-3 text-title font-extrabold text-ink-900">Возможности тарифа</h2>

      <div className="mb-5 space-y-3">
        <UsageCard
          icon={<Image src="/brand/3d/icon-calendar.png" alt="" width={44} height={44} unoptimized className="h-11 w-11 object-contain" />}
          label="Встречи"
          used={status.events!.used}
          limit={status.events!.limit}
        />
        <UsageCard
          icon={
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-gradient shadow-cta">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 19V6M6 11l6-6 6 6" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          }
          label="Поднятия"
          hint="В начало ленты встреч"
          used={status.boosts!.used}
          limit={status.boosts!.limit}
        />
      </div>

      <button
        onClick={() => setChangingPlan(true)}
        className="w-full rounded-card bg-accent py-4 text-base font-bold text-white shadow-cta active:scale-[0.98]"
      >
        Сменить тариф
      </button>
    </div>
  );
}

function UsageCard({
  icon,
  label,
  hint,
  used,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  used: number;
  limit: number | null;
}) {
  const isUnlimited = limit === null;
  const ratio = isUnlimited ? 0 : Math.min(1, used / Math.max(1, limit));

  return (
    <div className="rounded-card-lg bg-white px-5 py-4 shadow-card">
      <div className="flex items-center gap-4">
        <span className="shrink-0">{icon}</span>
        <span className="flex-1 text-base text-ink-900">{label}</span>
        <span className="text-lg font-bold text-ink-900">{isUnlimited ? "∞" : `${used} / ${limit}`}</span>
      </div>
      {isUnlimited ? (
        <p className="mt-3 text-sm text-ink-400">Без ограничений · использовано {used}</p>
      ) : (
        <div className="mt-4 h-2 overflow-hidden rounded-pill bg-lavender-100">
          <div className="h-full rounded-pill bg-brand-gradient" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
      {hint && <p className="mt-3 text-sm text-ink-400">{hint}</p>}
    </div>
  );
}
