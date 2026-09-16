mkdir -p "app/api/subscriptions"
cat > "app/api/subscriptions/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { PLAN_LIMITS } from "@/lib/subscriptions/limits";
import { isAdminTelegramId } from "@/lib/admin/is-admin";

/**
 * GET /api/subscriptions
 * Возвращает статус подписки текущего пользователя: активна ли, план,
 * лимиты и текущее использование. Используется paywall'ом (решить,
 * пускать ли сразу в создание встречи) и экраном профиля ("Мой пакет").
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const info = await getActiveSubscriptionInfo(admin, user.userId);

  if (!info) {
    // Админ тестирует приложение без реальной оплаты — лимиты по-прежнему
    // не действуют (см. app/api/events/route.ts), но счётчик "использовано"
    // теперь настоящий (не захардкоженный 0), чтобы можно было реально
    // проверить, что отмена встречи возвращает счётчик назад: считаем
    // реальные встречи, созданные админом с начала календарного месяца,
    // ИСКЛЮЧАЯ отменённые — именно так же, как decrement при отмене
    // логически "возвращает место" у настоящих подписчиков.
    if (isAdminTelegramId(user.telegramId)) {
      const limits = PLAN_LIMITS.premium;
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const { count: eventsUsed } = await admin
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("organizer_id", user.userId)
        .neq("status", "cancelled")
        .gte("created_at", periodStart.toISOString())
        .lt("created_at", periodEnd.toISOString());

      return NextResponse.json({
        active: true,
        plan: "premium",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        events: { used: eventsUsed ?? 0, limit: limits.eventsLimit },
        boosts: { used: 0, limit: limits.boostLimit },
      });
    }
    return NextResponse.json({ active: false });
  }

  const limits = PLAN_LIMITS[info.plan];

  return NextResponse.json({
    active: true,
    plan: info.plan,
    periodStart: info.currentPeriodStart,
    periodEnd: info.currentPeriodEnd,
    events: { used: info.eventsCreatedCount, limit: limits.eventsLimit },
    boosts: { used: info.boostsUsedCount, limit: limits.boostLimit },
  });
}
ENDOFFILE

mkdir -p "app/(app)/subscriptions"
cat > "app/(app)/subscriptions/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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

  return (
    <div className="px-5 py-6">
      <h1 className="text-display mb-6 text-center">Мой тариф</h1>

      <div className="relative mb-6 overflow-hidden rounded-card-lg bg-ink-900 p-6 text-center text-white shadow-card-lg">
        <div className="relative mx-auto mb-3 h-24 w-24">
          <Image src={PLAN_ICON[plan]} alt="" fill className="object-contain" sizes="96px" />
        </div>
        <h2 className="text-title text-white">{PLAN_TITLES[plan]}</h2>
        <p className="text-sm text-white/70">
          {status.periodStart
            ? `Действует с ${new Date(status.periodStart).toLocaleDateString("ru-RU")} по ${new Date(status.periodEnd!).toLocaleDateString("ru-RU")}`
            : `Активна до ${new Date(status.periodEnd!).toLocaleDateString("ru-RU")}`}
        </p>
      </div>

      <div className="mb-6 space-y-4 rounded-card bg-white p-5 shadow-card">
        <UsageRow label="Встречи" used={status.events!.used} limit={status.events!.limit} />
        <UsageRow label="Поднятия" used={status.boosts!.used} limit={status.boosts!.limit} />
      </div>

      <button
        onClick={() => setChangingPlan(true)}
        className="w-full rounded-pill border border-lavender-200 bg-white py-4 text-base font-semibold text-accent active:scale-[0.98]"
      >
        Сменить тариф
      </button>
    </div>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const ratio = isUnlimited ? 0 : Math.min(1, used / Math.max(1, limit));

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-ink-900">
        <span>{label}</span>
        <span className="text-ink-600">{isUnlimited ? `${used} · без ограничений` : `${used} / ${limit}`}</span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-lavender-100">
          <div className="h-full rounded-pill bg-brand-gradient" style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}
ENDOFFILE

