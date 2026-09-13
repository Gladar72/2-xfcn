import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/reviews/reviewable
 *
 * Все завершённые встречи, где текущий пользователь был участником, вместе
 * со списком остальных участников, которых ещё МОЖНО оценить (п.20 ТЗ:
 * "только реальные участники завершённой встречи могут оценивать друг друга").
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: myMemberships } = await admin
    .from("event_members")
    .select("event_id, events!inner(id, title, event_date, status)")
    .eq("user_id", currentUser.userId);

  const completedEventIds = (myMemberships ?? [])
    .filter((m) => (m.events as unknown as { status: string }).status === "completed")
    .map((m) => m.event_id);

  if (completedEventIds.length === 0) return NextResponse.json({ events: [] });

  const [{ data: allMembers }, { data: myReviews }] = await Promise.all([
    admin
      .from("event_members")
      .select("event_id, users(id, name, avatar_url)")
      .in("event_id", completedEventIds),
    admin
      .from("reviews")
      .select("event_id, reviewee_id")
      .eq("reviewer_id", currentUser.userId)
      .in("event_id", completedEventIds),
  ]);

  const alreadyReviewedKeys = new Set((myReviews ?? []).map((r) => `${r.event_id}:${r.reviewee_id}`));

  const events = completedEventIds
    .map((eventId) => {
      const meta = myMemberships!.find((m) => m.event_id === eventId)!.events as unknown as {
        id: string;
        title: string;
        event_date: string;
      };
      const otherMembers = (allMembers ?? [])
        .filter((m) => m.event_id === eventId)
        .map((m) => m.users as unknown as { id: string; name: string; avatar_url: string | null } | null)
        .filter(
          (u): u is { id: string; name: string; avatar_url: string | null } =>
            !!u && u.id !== currentUser.userId && !alreadyReviewedKeys.has(`${eventId}:${u.id}`)
        );
      return {
        eventId,
        title: meta.title,
        eventDate: meta.event_date,
        reviewableMembers: otherMembers,
      };
    })
    .filter((e) => e.reviewableMembers.length > 0);

  return NextResponse.json({ events });
}
