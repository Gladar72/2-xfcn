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
    // Админ тестирует приложение без реальной оплаты — показываем ему
    // синтетический безлимитный премиум вместо paywall'а.
    if (isAdminTelegramId(user.telegramId)) {
      const limits = PLAN_LIMITS.premium;
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      return NextResponse.json({
        active: true,
        plan: "premium",
        periodEnd: periodEnd.toISOString(),
        events: { used: 0, limit: limits.eventsLimit },
        boosts: { used: 0, limit: limits.boostLimit },
      });
    }
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
