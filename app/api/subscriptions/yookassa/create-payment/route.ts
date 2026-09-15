import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";

const PLAN_TITLES: Record<Plan, string> = {
  start: "Подписка «Старт»",
  medium: "Подписка «Медиум»",
  premium: "Подписка «Премьер»",
};

/**
 * POST /api/subscriptions/yookassa/create-payment
 * Body: { plan: "start" | "medium" | "premium" }
 *
 * Второй способ оплаты подписки — картой/СБП через ЮKassa, в дополнение
 * к оплате Telegram Stars. Работает и из приложения, и из кнопки в боте
 * (обе точки входа ведут на один и тот же Mini App с уже действующей
 * сессией — см. app/page.tsx, параметр goto).
 *
 * Активация подписки происходит НЕ здесь, а в вебхуке после реального
 * подтверждённого платежа — см. app/api/webhooks/yookassa/route.ts.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan as Plan | undefined;
  if (!plan || !(plan in PLAN_LIMITS)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });

  const admin = createAdminClient();
  const limits = PLAN_LIMITS[plan];

  try {
    const payment = await createYooKassaPayment({
      userId: user.userId,
      plan,
      amountRub: limits.priceRub,
      description: `${PLAN_TITLES[plan]} на 30 дней`,
      returnUrl: `${appUrl}/subscriptions?paid=1`,
    });

    // Записываем как "pending" сразу — если человек закроет страницу
    // оплаты не завершив её, у нас всё равно останется след платежа для
    // сверки/поддержки, а не только успешные попытки.
    await admin.from("payments").insert({
      user_id: user.userId,
      plan,
      amount: limits.priceRub,
      currency: "RUB",
      external_payment_id: payment.id,
      status: "pending",
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) return NextResponse.json({ error: "no_confirmation_url" }, { status: 502 });

    return NextResponse.json({ confirmationUrl });
  } catch (err) {
    console.error("POST /api/subscriptions/yookassa/create-payment:", err);
    return NextResponse.json({ error: "payment_creation_failed" }, { status: 502 });
  }
}
