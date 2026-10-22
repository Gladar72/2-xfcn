import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { PLAN_LIMITS } from "@/lib/subscriptions/limits";
import { loadPromoEvent, promoSlot, promotionStatus } from "@/lib/promotions/server";
import { promoteWithPlan } from "@/lib/promotions/plan";
import { PROMO_PRICE_RUB } from "@/lib/promotions/config";
import { createYooKassaPayment } from "@/lib/payments/yookassa";
import { eventUtcOffsetHours } from "@/lib/events/timing";

/**
 * «В популярное сегодня» — продвижение своей встречи (вместо «Поднять встречу»).
 *
 * GET  /api/promotions?eventId=…  — что покажет окно: когда встреча встанет первой,
 *      до какого времени останется в «Популярном», остаток по тарифу, цена разово,
 *      и текущее продвижение со счётчиками (если уже продвинута).
 * POST /api/promotions { eventId, method: "plan" | "pay", contact? }
 *      plan — списывает одно продвижение из тарифа (бывшие «поднятия»);
 *      pay  — разовая оплата через ЮKassa, продвижение включается в вебхуке.
 */

const PLAN_NAME = { start: "Старт", medium: "Медиум", premium: "Премьер" } as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const admin = createAdminClient();
  const e = await loadPromoEvent(admin, eventId);
  if (!e) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (e.organizer_id !== user.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [slot, sub, active] = await Promise.all([promoSlot(admin, e), getActiveSubscriptionInfo(admin, user.userId), promotionStatus(admin, eventId)]);
  const isAdmin = isAdminTelegramId(user.telegramId);
  const limit = sub ? PLAN_LIMITS[sub.plan].boostLimit : 0;
  return NextResponse.json({
    city: e.city,
    utcOffset: eventUtcOffsetHours(e),
    slot: slot.ok
      ? { ok: true, topFrom: slot.topFrom.toISOString(), topUntil: slot.topUntil.toISOString(), endsAt: slot.endsAt.toISOString(), queueAhead: slot.queueAhead }
      : { ok: false, reason: slot.reason },
    plan: isAdmin
      ? { name: "Админ", used: 0, limit: 99 }
      : sub
        ? { name: PLAN_NAME[sub.plan], used: sub.boostsUsedCount, limit }
        : null,
    price: PROMO_PRICE_RUB,
    active,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  const method = body?.method === "pay" ? "pay" : "plan";
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const admin = createAdminClient();
  const e = await loadPromoEvent(admin, eventId);
  if (!e) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (e.organizer_id !== user.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const slot = await promoSlot(admin, e);
  if (!slot.ok) return NextResponse.json({ error: slot.reason }, { status: 422 });

  if (method === "plan") {
    const r = await promoteWithPlan(admin, user, eventId);
    return NextResponse.json(r.body, { status: r.status });
  }

  // Разовая оплата.
  const appUrl = process.env.APP_URL;
  if (!appUrl) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  let contact = typeof body?.contact === "string" ? body.contact.trim() : undefined;
  if (contact) {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\+?\d{10,15}$/.test(contact.replace(/[\s()-]/g, ""));
    if (!isEmail && !isPhone) return NextResponse.json({ error: "invalid_contact" }, { status: 422 });
    contact = isPhone ? contact.replace(/[\s()-]/g, "") : contact;
    await admin.from("users").update({ receipt_contact: contact }).eq("id", user.userId);
  } else {
    const { data: existing } = await admin.from("users").select("receipt_contact, email, phone").eq("id", user.userId).maybeSingle();
    contact = existing?.receipt_contact ?? existing?.email ?? existing?.phone ?? undefined;
  }
  if (!contact) return NextResponse.json({ error: "contact_required" }, { status: 422 });

  try {
    const payment = await createYooKassaPayment({
      userId: user.userId,
      plan: "promotion",
      amountRub: PROMO_PRICE_RUB,
      description: "Продвижение встречи в «Популярное сегодня»",
      returnUrl: body?.returnTo === "app" ? `${appUrl}/pay/return` : `${appUrl}/events/${eventId}?promoted=1`,
      contact,
    });
    await admin.from("payments").insert({
      user_id: user.userId,
      plan: null,
      purpose: "promotion",
      event_id: eventId,
      amount: PROMO_PRICE_RUB,
      currency: "RUB",
      external_payment_id: payment.id,
      status: "pending",
    });
    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) return NextResponse.json({ error: "no_confirmation_url" }, { status: 502 });
    return NextResponse.json({ confirmationUrl });
  } catch (err) {
    console.error("POST /api/promotions (pay):", err);
    return NextResponse.json({ error: "payment_creation_failed" }, { status: 502 });
  }
}
