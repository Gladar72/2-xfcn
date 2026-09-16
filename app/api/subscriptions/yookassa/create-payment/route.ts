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
 * Body: { plan: "start" | "medium" | "premium", contact?: string }
 *
 * contact — email или телефон покупателя, куда уйдёт электронный чек
 * (54-ФЗ). Если не передан — берём ранее сохранённый (users.receipt_contact);
 * если передан — сохраняем его на будущее, чтобы не спрашивать снова.
 * Если контакта нет вообще нигде — просим ввести (contact_required).
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

  let contact = typeof body?.contact === "string" ? body.contact.trim() : undefined;
  if (contact) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\+?\d{10,15}$/.test(contact.replace(/[\s()-]/g, ""));
    if (!isEmail && !isPhone) return NextResponse.json({ error: "invalid_contact" }, { status: 422 });
    contact = isPhone ? contact.replace(/[\s()-]/g, "") : contact;
    await admin.from("users").update({ receipt_contact: contact }).eq("id", user.userId);
  } else {
    const { data: existing } = await admin
      .from("users")
      .select("receipt_contact")
      .eq("id", user.userId)
      .maybeSingle();
    contact = existing?.receipt_contact ?? undefined;
  }

  if (!contact) {
    return NextResponse.json({ error: "contact_required" }, { status: 422 });
  }

  try {
    const payment = await createYooKassaPayment({
      userId: user.userId,
      plan,
      amountRub: limits.priceRub,
      description: `${PLAN_TITLES[plan]} на 30 дней`,
      returnUrl: `${appUrl}/subscriptions?paid=1`,
      contact,
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
