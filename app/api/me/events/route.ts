import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/me/events?scope=upcoming|archive
 * Встречи, где текущий пользователь организатор или участник —
 * для экрана "Мои встречи" в профиле.
 *  - upcoming (по умолчанию): published + closed, ближайшие сверху;
 *  - archive: completed + cancelled, самые свежие сверху.
 */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") === "archive" ? "archive" : "upcoming";
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

  // Предстоящие: published и closed (заполненные — организатор/участники
  // всё ещё должны их видеть и пользоваться чатом). Архив: completed и
  // cancelled. Статус completed ставит cron /api/cron/complete-events.
  const statuses = scope === "archive" ? ["completed", "cancelled"] : ["published", "closed"];
  const ascending = scope !== "archive";

  const { data: events, error } = await admin
    .from("events")
    .select(
      `
      id, title, event_date, event_time, place_name, status, is_business, photo_url,
      category:categories(slug, name, emoji)
      `
    )
    .in("id", eventIds)
    .in("status", statuses)
    .order("event_date", { ascending })
    .order("event_time", { ascending })
    .limit(100);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  // Сколько новых (ещё не рассмотренных) заявок ждёт организатора на
  // каждую его встречу — чтобы показать значок прямо на карточке встречи,
  // не только общим уведомлением. Плюс аватарка ОДНОГО (самого свежего)
  // заявителя — чтобы сразу было видно, КТО откликнулся, не только сколько.
  const organizerEventIds =
    scope === "archive" ? [] : (events ?? []).map((e) => e.id).filter((id) => roleByEventId.get(id) === "organizer");
  const pendingCountByEventId = new Map<string, number>();
  const pendingPreviewByEventId = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
  if (organizerEventIds.length > 0) {
    const { data: pendingApplications } = await admin
      .from("applications")
      .select("event_id, created_at, applicant:users(id, name, avatar_url)")
      .in("event_id", organizerEventIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    for (const a of pendingApplications ?? []) {
      pendingCountByEventId.set(a.event_id, (pendingCountByEventId.get(a.event_id) ?? 0) + 1);
      if (!pendingPreviewByEventId.has(a.event_id)) {
        const applicant = a.applicant as unknown as { id: string; name: string; avatar_url: string | null } | null;
        if (applicant) {
          pendingPreviewByEventId.set(a.event_id, {
            id: applicant.id,
            name: applicant.name,
            avatarUrl: applicant.avatar_url,
          });
        }
      }
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
    isBusiness: e.is_business,
    photoUrl: e.photo_url ?? null,
    role: roleByEventId.get(e.id) === "organizer" ? "organizer" : "participant",
    pendingApplicationsCount: pendingCountByEventId.get(e.id) ?? 0,
    pendingApplicantPreview: pendingPreviewByEventId.get(e.id) ?? null,
  }));

  return NextResponse.json({ items });
}
