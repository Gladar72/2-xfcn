import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";

const ASSUMED_EVENT_DURATION_HOURS = 2; // считаем встречу завершённой через 2ч после начала, если явно не закрыта раньше

/**
 * GET /api/n8n/due-review-requests
 *
 * Workflow 5 (п.27 ТЗ): "После встречи → запросить отзыв".
 * Заодно переводит статус встречи в 'completed', если она ещё 'published'
 * и уже прошла — это единственное место, где n8n-опрос совмещён с лёгкой
 * бизнес-логикой перехода статуса; сам переход тривиален и безопасен для
 * повторного вызова (идемпотентен по условию status='published').
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, event_date, event_time")
    .eq("status", "published")
    .lte("event_date", todayIso);

  const finished = (candidates ?? []).filter((e) => {
    const start = new Date(`${e.event_date}T${e.event_time}`);
    const end = new Date(start.getTime() + ASSUMED_EVENT_DURATION_HOURS * 60 * 60 * 1000);
    return end <= now;
  });

  if (finished.length === 0) return NextResponse.json({ items: [] });

  const finishedIds = finished.map((e) => e.id);

  await admin.from("events").update({ status: "completed" }).in("id", finishedIds).eq("status", "published");

  const { data: allFinishedMembers } = await admin
    .from("event_members")
    .select("user_id")
    .in("event_id", finishedIds);
  const uniqueMemberIds = Array.from(new Set((allFinishedMembers ?? []).map((m) => m.user_id)));
  if (uniqueMemberIds.length > 0) {
    await admin.rpc("increment_completed_meetings", { p_user_ids: uniqueMemberIds });
  }

  const { data: alreadyNotified } = await admin
    .from("notifications")
    .select("payload")
    .eq("type", "review_request");
  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId).filter(Boolean)
  );

  const { data: members } = await admin
    .from("event_members")
    .select("event_id, users(id, telegram_id)")
    .in("event_id", finishedIds);

  const items = finished
    .filter((e) => !alreadyNotifiedEventIds.has(e.id))
    .map((event) => {
      const recipients = (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => m.users as unknown as { id: string; telegram_id: number } | null)
        .filter((u): u is { id: string; telegram_id: number } => !!u);
      return { eventId: event.id, title: event.title, recipients: recipients.map((r) => r.telegram_id) };
    })
    .filter((item) => item.recipients.length > 0);

  if (items.length > 0) {
    await admin.from("notifications").insert(
      items.flatMap((item) =>
        (members ?? [])
          .filter((m) => m.event_id === item.eventId)
          .map((m) => ({
            user_id: (m.users as unknown as { id: string } | null)?.id,
            type: "review_request",
            payload: { eventId: item.eventId },
          }))
          .filter((n) => n.user_id)
      )
    );
  }

  return NextResponse.json({ items });
}
