import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/is-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/metrics
 * Сводка для главного экрана admin dashboard (п.29 ТЗ).
 *
 * Честное ограничение: DAU в строгом смысле (уникальные пользователи,
 * реально открывшие приложение сегодня) требует отдельного пайплайна
 * событий — это Этап 34 (аналитика). Пока используем более грубую метрику
 * "новых регистраций за периоды", а DAU помечаем как "недоступно" —
 * лучше явно показать это, чем подсунуть придуманное число.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = createAdminClient();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonthIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: newUsers7d },
    { count: bannedUsers },
    { count: totalEvents },
    { count: completedEvents },
    { count: totalApplications },
    { count: acceptedApplications },
    { data: activeSubscriptions },
    { count: totalSubscriptionsEver },
    { data: payments },
    { count: pendingReports },
    { data: reviewRatings },
  ] = await Promise.all([
    db.from("users").select("*", { count: "exact", head: true }),
    db.from("users").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
    db.from("users").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    db.from("users").select("*", { count: "exact", head: true }).eq("moderation_status", "banned"),
    db.from("events").select("*", { count: "exact", head: true }),
    db.from("events").select("*", { count: "exact", head: true }).eq("status", "completed"),
    db.from("applications").select("*", { count: "exact", head: true }),
    db.from("applications").select("*", { count: "exact", head: true }).eq("status", "accepted"),
    db.from("subscriptions").select("plan").eq("status", "active"),
    // "Сколько оформлено подписок" — за всё время, не только сейчас
    // активные (та цифра выше, в planCounts) — иначе не видно ни сколько
    // всего когда-либо купили, ни какая доля из них продлевается/уходит.
    db.from("subscriptions").select("*", { count: "exact", head: true }),
    db.from("payments").select("amount, currency, status, created_at"),
    db.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("reviews").select("rating"),
  ]);

  const planCounts = { start: 0, medium: 0, premium: 0 };
  for (const sub of activeSubscriptions ?? []) {
    if (sub.plan in planCounts) planCounts[sub.plan as keyof typeof planCounts]++;
  }

  // Рубли (ЮKassa) и Telegram Stars — РАЗНЫЕ валюты, их нельзя складывать
  // в одну сумму (раньше здесь так и было — revenueStars фактически
  // смешивал рубли и звёзды в одно бессмысленное число). Считаем отдельно.
  const succeededPayments = (payments ?? []).filter((p) => p.status === "succeeded");
  const succeededThisMonth = succeededPayments.filter((p) => p.created_at >= startOfMonthIso);
  function sumByCurrency(rows: typeof succeededPayments, currency: string): number {
    return rows.filter((p) => p.currency === currency).reduce((sum, p) => sum + p.amount, 0);
  }

  const avgRating =
    reviewRatings && reviewRatings.length > 0
      ? reviewRatings.reduce((sum, r) => sum + r.rating, 0) / reviewRatings.length
      : null;

  return NextResponse.json({
    users: { total: totalUsers ?? 0, newToday: newUsersToday ?? 0, new7d: newUsers7d ?? 0, banned: bannedUsers ?? 0 },
    dau: null, // см. комментарий выше
    events: { total: totalEvents ?? 0, completed: completedEvents ?? 0 },
    applications: {
      total: totalApplications ?? 0,
      accepted: acceptedApplications ?? 0,
      conversionRate: totalApplications ? (acceptedApplications ?? 0) / totalApplications : 0,
    },
    subscriptions: { active: planCounts, totalEverPurchased: totalSubscriptionsEver ?? 0 },
    payments: {
      succeededCount: succeededPayments.length,
      succeededCountThisMonth: succeededThisMonth.length,
      revenueRub: sumByCurrency(succeededPayments, "RUB"),
      revenueRubThisMonth: sumByCurrency(succeededThisMonth, "RUB"),
      revenueStars: sumByCurrency(succeededPayments, "XTR"),
      revenueStarsThisMonth: sumByCurrency(succeededThisMonth, "XTR"),
    },
    reports: { pending: pendingReports ?? 0 },
    reviews: { avgRating, count: reviewRatings?.length ?? 0 },
  });
}
