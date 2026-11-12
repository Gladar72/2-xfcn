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

  const admin = createAdminClient({ noStore: true });
  const statuses = scope === "archive" ? ["completed", "cancelled"] : ["published", "closed"];
  // Ownership is authoritative even if a separate membership write once failed.
  // Accepted applications also keep the participant's event discoverable.
  const [membership, applications, owned] = await Promise.all([
    admin.from("event_members").select("event_id, role").eq("user_id", currentUser.userId),
    admin.from("applications").select("event_id, status").eq("user_id", currentUser.userId)
      .in("status", scope === "archive" ? ["accepted"] : ["pending", "accepted"]),
    admin.from("events").select("id").eq("organizer_id", currentUser.userId).in("status", statuses),
  ]);
  if (membership.error || applications.error || owned.error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 503 });
  }
  const pendingIds = new Set((applications.data ?? []).filter(row => row.status === "pending").map(row => row.event_id));
  const roleByEventId = new Map((membership.data ?? []).map(row => [row.event_id, row.role]));
  for (const row of applications.data ?? []) if (row.status === "accepted" && !roleByEventId.has(row.event_id)) roleByEventId.set(row.event_id, "participant");
  for (const row of owned.data ?? []) roleByEventId.set(row.id, "organizer");
  const eventIds = [...new Set([...roleByEventId.keys(), ...pendingIds])];
  if (!eventIds.length) return NextResponse.json({ items: [] });

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
    // pending — заявка отправлена, организатор ещё не ответил
    myStatus: roleByEventId.has(e.id) ? "member" : pendingIds.has(e.id) ? "pending" : "member",
    pendingApplicationsCount: pendingCountByEventId.get(e.id) ?? 0,
    pendingApplicantPreview: pendingPreviewByEventId.get(e.id) ?? null,
  }));

  return NextResponse.json({ items });
}
