import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { getActiveSubscriptionInfo, incrementBoostsUsed } from "@/lib/subscriptions/server";
import { canUseBoost } from "@/lib/subscriptions/limits";
import { createPromotion, loadPromoEvent, promoSlot, promotionStatus } from "@/lib/promotions/server";

/** Продвижение по тарифу (бывшее «поднятие»): проверки + списание одного из лимита. */
export async function promoteWithPlan(
  admin: SupabaseClient,
  user: { userId: string; telegramId: number | null | undefined },
  eventId: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const e = await loadPromoEvent(admin, eventId);
  if (!e) return { status: 404, body: { error: "event_not_found" } };
  if (e.organizer_id !== user.userId) return { status: 403, body: { error: "forbidden" } };
  const slot = await promoSlot(admin, e);
  if (!slot.ok) return { status: 422, body: { error: slot.reason } };
  const isAdmin = isAdminTelegramId(user.telegramId ?? 0);
  const sub = await getActiveSubscriptionInfo(admin, user.userId);
  if (!isAdmin) {
    if (!sub) return { status: 402, body: { error: "subscription_required" } };
    if (!canUseBoost(sub.plan, sub.boostsUsedCount)) return { status: 403, body: { error: "boost_limit_reached" } };
  }
  const res = await createPromotion(admin, e, user.userId, isAdmin && !sub ? "admin" : "plan");
  if (!res.ok) return { status: 422, body: { error: res.reason } };
  if (!isAdmin && sub) await incrementBoostsUsed(admin, sub.subscriptionId, sub.currentPeriodStart);
  return { status: 200, body: { status: "promoted", promotion: await promotionStatus(admin, eventId) } };
}
