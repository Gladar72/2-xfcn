import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const reviewSchema = z.object({
  eventId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  arrivedOnTime: z.boolean().optional(),
  pleasantCommunication: z.boolean().optional(),
  meetingHappened: z.boolean().optional(),
  wouldMeetAgain: z.boolean().optional(),
});

/**
 * POST /api/reviews
 * Отзыв о другом участнике завершённой встречи (п.20 ТЗ).
 * Защита от повторного отзыва — unique constraint (event_id, reviewer_id,
 * reviewee_id) в БД, здесь просто аккуратно превращаем 23505 в понятную ошибку.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  if (input.revieweeId === currentUser.userId) {
    return NextResponse.json({ error: "cannot_review_self" }, { status: 422 });
  }

  const admin = createAdminClient();

  const { data: event } = await admin.from("events").select("status").eq("id", input.eventId).maybeSingle();
  if (!event || event.status !== "completed") {
    return NextResponse.json({ error: "event_not_completed" }, { status: 422 });
  }

  const { data: members } = await admin
    .from("event_members")
    .select("user_id")
    .eq("event_id", input.eventId)
    .in("user_id", [currentUser.userId, input.revieweeId]);

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  if (!memberIds.has(currentUser.userId) || !memberIds.has(input.revieweeId)) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }

  const { error: insertError } = await admin.from("reviews").insert({
    event_id: input.eventId,
    reviewer_id: currentUser.userId,
    reviewee_id: input.revieweeId,
    rating: input.rating,
    arrived_on_time: input.arrivedOnTime ?? null,
    pleasant_communication: input.pleasantCommunication ?? null,
    meeting_happened: input.meetingHappened ?? null,
    would_meet_again: input.wouldMeetAgain ?? null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.rpc("apply_review_to_rating", { p_user_id: input.revieweeId, p_rating: input.rating });

  return NextResponse.json({ status: "created" });
}
