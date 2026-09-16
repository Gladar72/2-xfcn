import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/me/events
 * Все встречи, где текущий пользователь организатор или участник —
 * для экрана "Мои встречи" в профиле.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: memberRows } = await admin
    .from("event_members")
    .select("event_id, role")
    .eq("user_id", currentUser.userId);

  const eventIds = (memberRows ?? []).map((m) => m.event_id);
  if (eventIds.length === 0) return NextResponse.json({ items: [] });

  const roleByEventId = new Map((memberRows ?? []).map((m) => [m.event_id, m.role]));

  const { data: events, error } = await admin
    .from("events")
    .select(
      `
      id, title, event_date, event_time, place_name, status,
      category:categories(slug, name, emoji)
      `
    )
    .in("id", eventIds)
    .order("event_date", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  // Сколько новых (ещё не рассмотренных) заявок ждёт организатора на
  // каждую его встречу — чтобы показать значок прямо на карточке встречи,
  // не только общим уведомлением.
  const organizerEventIds = eventIds.filter((id) => roleByEventId.get(id) === "organizer");
  const pendingCountByEventId = new Map<string, number>();
  if (organizerEventIds.length > 0) {
    const { data: pendingApplications } = await admin
      .from("applications")
      .select("event_id")
      .in("event_id", organizerEventIds)
      .eq("status", "pending");
    for (const a of pendingApplications ?? []) {
      pendingCountByEventId.set(a.event_id, (pendingCountByEventId.get(a.event_id) ?? 0) + 1);
    }
  }

  const items = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    placeName: e.place_name,
    status: e.status,
    category: e.category,
    role: roleByEventId.get(e.id) === "organizer" ? "organizer" : "participant",
    pendingApplicationsCount: pendingCountByEventId.get(e.id) ?? 0,
  }));

  return NextResponse.json({ items });
}
