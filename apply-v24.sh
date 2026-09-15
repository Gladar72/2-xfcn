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
    periodEnd: info.currentPeriodEnd,
    events: { used: info.eventsCreatedCount, limit: limits.eventsLimit },
    boosts: { used: info.boostsUsedCount, limit: limits.boostLimit },
  });
}
ENDOFFILE
