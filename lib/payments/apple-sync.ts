import type { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscriptions/server";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";
import { recordReferralCommission } from "@/lib/subscriptions/referrals";
import { notifyTelegram } from "@/lib/telegram/notify";
import { APPLE_NET_SHARE, APPLE_PRODUCTS, bundleId, type AppleSubscriptionState, type AppleTransaction } from "./apple";

type Admin = ReturnType<typeof createAdminClient>;

export type AppleSyncResult =
  | { ok: true; active: boolean; plan: Plan; expiresAt: string | null; renewed: boolean }
  | { ok: false; error: "wrong_app" | "unknown_product" | "other_account" | "sandbox_disabled"; message: string };

const OTHER_ACCOUNT = "Эта подписка App Store оформлена из другого профиля «Места»";

/**
 * Песочница — это TestFlight и проверка в App Review. По умолчанию принимаем
 * (иначе ревьюер Apple не сможет проверить покупку), APPLE_ALLOW_SANDBOX=0 — выключить.
 */
function sandboxAllowed(): boolean {
  return process.env.APPLE_ALLOW_SANDBOX !== "0";
}

/**
 * Чей это аккаунт «Места». Главный признак — appAccountToken (= id пользователя),
 * который приложение передаёт в каждую покупку и который Apple подписывает в транзакции.
 * Без токена — по прошлой связке подписки с аккаунтом.
 */
export async function appleOwner(admin: Admin, t: AppleTransaction): Promise<string | null> {
  const token = t.appAccountToken?.toLowerCase();
  if (token && /^[0-9a-f-]{36}$/.test(token)) {
    const { data: u } = await admin.from("users").select("id").eq("id", token).maybeSingle();
    if (u) return u.id as string;
  }
  const { data: link } = await admin
    .from("apple_subscriptions")
    .select("user_id")
    .eq("original_transaction_id", t.originalTransactionId)
    .maybeSingle();
  return (link?.user_id as string | undefined) ?? null;
}

/** Возврат денег за конкретную транзакцию: платёж — refunded, начисленную партнёру (ещё не выведенную) комиссию снимаем. */
export async function markAppleRefund(admin: Admin, transactionId: string): Promise<void> {
  const { data: payment } = await admin
    .from("payments")
    .update({ status: "refunded" })
    .eq("external_payment_id", `apple:${transactionId}`)
    .select("id")
    .maybeSingle();
  if (!payment) return;
  const { data: left } = await admin
    .from("referral_commissions")
    .delete()
    .eq("payment_id", payment.id)
    .eq("status", "accrued")
    .select("id");
  if (!left?.length) {
    const { count } = await admin.from("referral_commissions").select("id", { count: "exact", head: true }).eq("payment_id", payment.id);
    if (count) console.warn(`apple refund ${transactionId}: комиссия партнёру уже запрошена или выплачена`);
  }
}

/**
 * Применяет состояние подписки App Store (уже проверенное у Apple) к пользователю:
 * связывает подписку с аккаунтом, продлевает тариф до даты окончания из App Store,
 * записывает оплату и начисляет партнёру 30% с нашей доли.
 * Идемпотентность — по номеру транзакции (payments.external_payment_id уникален):
 * одну транзакцию применяем ровно один раз, даже если проверка и уведомление пришли одновременно.
 */
export async function applyAppleState(admin: Admin, userId: string, state: AppleSubscriptionState): Promise<AppleSyncResult> {
  const t = state.transaction;
  if (t.bundleId !== bundleId()) return { ok: false, error: "wrong_app", message: "Покупка сделана в другом приложении" };
  const plan = APPLE_PRODUCTS[t.productId];
  if (!plan) return { ok: false, error: "unknown_product", message: "Неизвестный тариф" };
  const owner = await appleOwner(admin, t);
  if (owner && owner !== userId) return { ok: false, error: "other_account", message: OTHER_ACCOUNT };
  const sandbox = t.environment !== "Production";
  if (sandbox && !sandboxAllowed()) return { ok: false, error: "sandbox_disabled", message: "Тестовые покупки отключены" };

  const expiresAt = t.expiresDate ? new Date(t.expiresDate).toISOString() : null;
  await admin.from("apple_subscriptions").upsert(
    {
      original_transaction_id: t.originalTransactionId,
      user_id: userId,
      product_id: t.productId,
      plan,
      status: state.status,
      expires_at: expiresAt,
      environment: t.environment,
      last_transaction_id: t.transactionId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "original_transaction_id" }
  );

  if (t.revocationDate) {
    // Возврат денег через Apple — закрываем текущий период этого тарифа.
    await admin
      .from("subscriptions")
      .update({ current_period_end: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("plan", plan);
    await markAppleRefund(admin, t.transactionId);
    return { ok: true, active: false, plan, expiresAt, renewed: false };
  }

  const active = (state.status === 1 || state.status === 4) && !!t.expiresDate && t.expiresDate > Date.now();
  if (!active || !t.expiresDate) return { ok: true, active: false, plan, expiresAt, renewed: false };

  // Сначала «занимаем» транзакцию: если строка уже есть — её уже применили.
  const amount = sandbox ? 0 : t.price && t.currency === "RUB" ? Math.round(t.price / 1000) : PLAN_LIMITS[plan].priceRub;
  const { data: payment, error: payErr } = await admin
    .from("payments")
    .insert({
      user_id: userId,
      plan,
      amount,
      currency: "RUB",
      external_payment_id: `${sandbox ? "apple-sandbox" : "apple"}:${t.transactionId}`,
      status: "succeeded",
    })
    .select("id")
    .single();
  if (payErr || !payment) {
    if (payErr?.code !== "23505") console.error("applyAppleState payment insert:", payErr);
    return { ok: true, active: true, plan, expiresAt, renewed: false };
  }

  // Тот же тариф уже оплачен дольше (например, через ЮKassa) — не укорачиваем.
  const { data: current } = await admin
    .from("subscriptions")
    .select("plan, current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const currentEnd = current && current.plan === plan ? new Date(current.current_period_end as string).getTime() : 0;
  let subscriptionId: string;
  try {
    ({ subscriptionId } = await activateSubscription(admin, userId, plan, new Date(Math.max(t.expiresDate, currentEnd))));
  } catch (e) {
    // Не смогли включить тариф — освобождаем транзакцию, чтобы повтор (Apple/приложение) применил её заново.
    await admin.from("payments").delete().eq("id", payment.id);
    throw e;
  }
  await admin.from("payments").update({ subscription_id: subscriptionId }).eq("id", payment.id);

  if (!sandbox) {
    await recordReferralCommission(
      admin,
      { paymentId: payment.id, userId, amount: Math.round(amount * APPLE_NET_SHARE * 100) / 100, currency: "RUB" },
      notifyTelegram
    );
  }
  return { ok: true, active: true, plan, expiresAt, renewed: true };
}
