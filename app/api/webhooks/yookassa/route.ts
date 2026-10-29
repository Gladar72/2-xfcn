import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getYooKassaPayment } from "@/lib/payments/yookassa";
import { activateSubscription } from "@/lib/subscriptions/server";
import { notifyTelegram } from "@/lib/telegram/notify";
import { notifyUser } from "@/lib/notify/user";
import type { Plan } from "@/lib/subscriptions/limits";
import { recordReferralCommission } from "@/lib/subscriptions/referrals";
import { createPromotion, loadPromoEvent } from "@/lib/promotions/server";
import { promoClock } from "@/lib/promotions/config";
import { eventUtcOffsetHours } from "@/lib/events/timing";

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
    .select("id, user_id, plan, status, amount, currency, purpose, event_id")
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
    // В payments.status допустимы только pending/succeeded/failed/refunded.
    // Отменённый в ЮKassa платёж помечаем failed; промежуточные статусы
    // (pending, waiting_for_capture) не пишем — строка остаётся pending.
    if (realStatus.status === "canceled") {
      await admin.from("payments").update({ status: "failed" }).eq("id", paymentRow.id);
    }
    return NextResponse.json({ status: "not_paid_yet" });
  }

  // Разовое продвижение встречи в топ ленты.
  if (paymentRow.purpose === "promotion") {
    await admin.from("payments").update({ status: "succeeded" }).eq("id", paymentRow.id);
    const { data: u } = await admin.from("users").select("telegram_id").eq("id", paymentRow.user_id).maybeSingle();
    const ev = paymentRow.event_id ? await loadPromoEvent(admin, paymentRow.event_id) : null;
    const res = ev ? await createPromotion(admin, ev, paymentRow.user_id, "paid", paymentRow.id) : { ok: false as const, reason: "event_not_found" };
    if (res.ok && ev) {
      const off = eventUtcOffsetHours(ev);
      const first = Date.parse(res.row.top_from) <= Date.now() + 60_000;
      const text = first
        ? `Встреча «${ev.title}» в топе до ${promoClock(res.row.top_until, off)}`
        : `Встреча «${ev.title}» поднимется в топ в ${promoClock(res.row.top_from, off)}`;
      await notifyUser(admin, paymentRow.user_id, {
        title: "Встреча в топе",
        body: text,
        url: `/events/${ev.id}`,
        data: { type: "promotion_started" },
        telegramText: `🔝 ${text}.`,
        telegramId: u?.telegram_id ?? null,
      });
    } else {
      // Оплатили, но встреча уже началась / отменена — нужен возврат вручную.
      for (const id of (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",").map((x) => Number(x.trim())).filter(Boolean)) {
        await notifyTelegram(id, `⚠️ Продвижение оплачено, но не включилось (${res.ok ? "" : res.reason}). Платёж ЮKassa ${paymentId}, встреча ${paymentRow.event_id}. Нужен возврат 149 ₽.`).catch(() => {});
      }
      await notifyUser(admin, paymentRow.user_id, {
        title: "Не получилось продвинуть встречу",
        body: `${!res.ok && res.reason === "other_event_promoted" ? "В топе уже стоит другая твоя встреча" : "Встреча уже началась или закрыта"}. Вернём деньги в течение нескольких дней.`,
        url: "/support",
        data: { type: "promotion_failed" },
        telegramText: `Не получилось продвинуть встречу: ${!res.ok && res.reason === "other_event_promoted" ? "в топе уже стоит другая твоя встреча" : "она уже началась или закрыта"}. Вернём деньги в течение нескольких дней — если будут вопросы, напиши в поддержку.`,
        telegramId: u?.telegram_id ?? null,
      });
    }
    return NextResponse.json({ status: res.ok ? "promoted" : "promotion_failed" });
  }

  const plan = paymentRow.plan as Plan;
  const { subscriptionId } = await activateSubscription(admin, paymentRow.user_id, plan);

  await admin
    .from("payments")
    .update({ status: "succeeded", subscription_id: subscriptionId })
    .eq("id", paymentRow.id);

  // Партнёрская программа: 30% блогеру, если плательщик пришёл по его ссылке.
  await recordReferralCommission(
    admin,
    { paymentId: paymentRow.id, userId: paymentRow.user_id, amount: Number(paymentRow.amount), currency: paymentRow.currency ?? "RUB" },
    notifyTelegram
  );

  const { data: user } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", paymentRow.user_id)
    .maybeSingle();
  await notifyUser(admin, paymentRow.user_id, {
    title: "Оплата прошла ✅",
    body: `Подписка «${plan.toUpperCase()}» активирована на 30 дней`,
    url: "/profile",
    data: { type: "payment_succeeded" },
    telegramText: `✅ Оплата прошла — подписка «${plan.toUpperCase()}» активирована на 30 дней.`,
    telegramId: user?.telegram_id ?? null,
  });

  return NextResponse.json({ status: "activated" });
}
