import type { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "./limits";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ActiveSubscriptionInfo {
  subscriptionId: string;
  plan: Plan;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  eventsCreatedCount: number;
  boostsUsedCount: number;
}

/**
 * Возвращает активную подписку пользователя вместе со счётчиками
 * использования за ТЕКУЩИЙ расчётный период (создаёт строку в
 * subscription_usage, если её ещё нет — например, сразу после оплаты).
 *
 * Возвращает null, если активной подписки нет — тогда вызывающий код
 * должен показать paywall (см. app/api/subscriptions/route.ts).
 */
export async function getActiveSubscriptionInfo(
  admin: AdminClient,
  userId: string
): Promise<ActiveSubscriptionInfo | null> {
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, plan, current_period_start, current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!subscription) return null;

  const { data: existingUsage } = await admin
    .from("subscription_usage")
    .select("events_created_count, boosts_used_count")
    .eq("subscription_id", subscription.id)
    .eq("period_start", subscription.current_period_start)
    .maybeSingle();

  if (existingUsage) {
    return {
      subscriptionId: subscription.id,
      plan: subscription.plan as Plan,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      eventsCreatedCount: existingUsage.events_created_count,
      boostsUsedCount: existingUsage.boosts_used_count,
    };
  }

  const { data: createdUsage } = await admin
    .from("subscription_usage")
    .insert({
      subscription_id: subscription.id,
      period_start: subscription.current_period_start,
      period_end: subscription.current_period_end,
    })
    .select("events_created_count, boosts_used_count")
    .single();

  return {
    subscriptionId: subscription.id,
    plan: subscription.plan as Plan,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    eventsCreatedCount: createdUsage?.events_created_count ?? 0,
    boostsUsedCount: createdUsage?.boosts_used_count ?? 0,
  };
}

/**
 * Атомарно увеличивает счётчик созданных встреч за период.
 * Использует UPDATE ... SET x = x + 1 (не read-modify-write из JS),
 * чтобы избежать гонки при параллельных запросах.
 */
export async function incrementEventsCreated(
  admin: AdminClient,
  subscriptionId: string,
  periodStart: string
): Promise<void> {
  await admin.rpc("increment_subscription_usage_field", {
    p_subscription_id: subscriptionId,
    p_period_start: periodStart,
    p_field: "events_created_count",
  });
}

export async function incrementBoostsUsed(
  admin: AdminClient,
  subscriptionId: string,
  periodStart: string
): Promise<void> {
  await admin.rpc("increment_subscription_usage_field", {
    p_subscription_id: subscriptionId,
    p_period_start: periodStart,
    p_field: "boosts_used_count",
  });
}
