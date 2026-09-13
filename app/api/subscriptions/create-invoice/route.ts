import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createStarsInvoiceLink } from "@/lib/telegram/bot-api";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";

const PLAN_TITLES: Record<Plan, string> = {
  start: "Подписка START",
  medium: "Подписка MEDIUM",
  premium: "Подписка PREMIUM",
};

/**
 * POST /api/subscriptions/create-invoice
 * Body: { plan: "start" | "medium" | "premium" }
 *
 * Создаёт ссылку на оплату через Telegram Stars. Сама активация подписки
 * происходит НЕ здесь, а на Этапе 25 — в обработчике webhook'а от Telegram
 * после реального успешного платежа (см. app/api/payments/telegram-webhook).
 * Мы никогда не активируем подписку по одному только факту создания инвойса.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const plan = body?.plan as Plan | undefined;

  if (!plan || !(plan in PLAN_LIMITS)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const limits = PLAN_LIMITS[plan];

  try {
    const invoiceLink = await createStarsInvoiceLink({
      title: PLAN_TITLES[plan],
      description: `Доступ к созданию встреч по тарифу ${plan.toUpperCase()} на 30 дней`,
      payload: JSON.stringify({ userId: user.userId, plan }),
      amountStars: limits.priceStars,
    });

    return NextResponse.json({ invoiceLink });
  } catch {
    return NextResponse.json({ error: "invoice_creation_failed" }, { status: 502 });
  }
}
