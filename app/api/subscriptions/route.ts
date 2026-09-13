import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { PLAN_LIMITS } from "@/lib/subscriptions/limits";

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
    return NextResponse.json({ active: false });
  }

  const limits = PLAN_LIMITS[info.plan];

  return NextResponse.json({
    active: true,
    plan: info.plan,
    periodEnd: info.currentPeriodEnd,
    events: { used: info.eventsCreatedCount, limit: limits.eventsLimit },
    boosts: { used: info.boostsUsedCount, limit: limits.boostLimit },
  });
}
