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
    { data: payments },
    { count: pendingReports },
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
    db.from("payments").select("amount, status"),
    db.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const planCounts = { start: 0, medium: 0, premium: 0 };
  for (const sub of activeSubscriptions ?? []) {
    if (sub.plan in planCounts) planCounts[sub.plan as keyof typeof planCounts]++;
  }

  const succeededPayments = (payments ?? []).filter((p) => p.status === "succeeded");
  const revenueStars = succeededPayments.reduce((sum, p) => sum + p.amount, 0);

  return NextResponse.json({
    users: { total: totalUsers ?? 0, newToday: newUsersToday ?? 0, new7d: newUsers7d ?? 0, banned: bannedUsers ?? 0 },
    dau: null, // см. комментарий выше
    events: { total: totalEvents ?? 0, completed: completedEvents ?? 0 },
    applications: {
      total: totalApplications ?? 0,
      accepted: acceptedApplications ?? 0,
      conversionRate: totalApplications ? (acceptedApplications ?? 0) / totalApplications : 0,
    },
    subscriptions: planCounts,
    payments: { succeededCount: succeededPayments.length, revenueStars },
    reports: { pending: pendingReports ?? 0 },
  });
}
