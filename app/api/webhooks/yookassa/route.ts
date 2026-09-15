import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYooKassaPayment } from "@/lib/payments/yookassa";
import { activateSubscription } from "@/lib/subscriptions/server";
import { notifyTelegram } from "@/lib/telegram/notify";
import type { Plan } from "@/lib/subscriptions/limits";

/**
 * POST /api/webhooks/yookassa
 *
 * ЮKassa шлёт сюда уведомление о статусе платежа. КЛЮЧЕВОЕ правило
 * безопасности: тело этого запроса — не источник истины. Кто угодно в
 * интернете может отправить POST на этот публичный URL с поддельным телом
 * вида {"event": "payment.succeeded", ...}. Поэтому по id платежа из тела
 * мы ВСЕГДА дополнительно запрашиваем реальный статус напрямую у ЮKassa
 * через API с нашим секретным ключом (подделать этот встречный запрос
 * нельзя) — и активируем подписку только по его результату.
 *
 * Идемпотентность: если платёж уже помечен как succeeded в нашей базе —
 * просто отвечаем 200 и ничего не делаем повторно (ЮKassa может прислать
 * уведомление больше одного раза).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const paymentId = body?.object?.id as string | undefined;

  if (!paymentId) {
    // Отвечаем 200 в любом случае — ЮKassa не должна повторять доставку
    // некорректного тела бесконечно.
    return NextResponse.json({ status: "ignored" });
  }

  const admin = createAdminClient();

  const { data: paymentRow } = await admin
    .from("payments")
    .select("id, user_id, plan, status")
    .eq("external_payment_id", paymentId)
    .maybeSingle();

  if (!paymentRow) {
    console.error(`Вебхук ЮKassa: платёж ${paymentId} не найден в нашей базе`);
    return NextResponse.json({ status: "unknown_payment" });
  }

  if (paymentRow.status === "succeeded") {
    return NextResponse.json({ status: "already_processed" });
  }

  let realStatus;
  try {
    realStatus = await getYooKassaPayment(paymentId);
  } catch (err) {
    console.error("Вебхук ЮKassa: не удалось проверить статус платежа:", err);
    // Возвращаем ошибку — пусть ЮKassa повторит доставку вебхука позже.
    return NextResponse.json({ status: "verification_failed" }, { status: 502 });
  }

  if (!realStatus.paid || realStatus.status !== "succeeded") {
    await admin.from("payments").update({ status: realStatus.status }).eq("id", paymentRow.id);
    return NextResponse.json({ status: "not_paid_yet" });
  }

  const plan = paymentRow.plan as Plan;
  const { subscriptionId } = await activateSubscription(admin, paymentRow.user_id, plan);

  await admin
    .from("payments")
    .update({ status: "succeeded", subscription_id: subscriptionId })
    .eq("id", paymentRow.id);

  const { data: user } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", paymentRow.user_id)
    .maybeSingle();
  if (user) {
    notifyTelegram(user.telegram_id, `✅ Оплата прошла — подписка «${plan.toUpperCase()}» активирована на 30 дней.`).catch(
      () => {}
    );
  }

  return NextResponse.json({ status: "activated" });
}
