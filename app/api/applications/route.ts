import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyN8n } from "@/lib/n8n/notify";

/**
 * POST /api/applications
 * Body: { eventId: string }
 *
 * Отклик на встречу (кнопка "Хочу пойти", п.13 ТЗ). Бесплатно и без
 * ограничений по тарифу — лимитируется только создание своих встреч.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status, seats_total, seats_taken")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.status !== "published") {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  if (event.organizer_id === currentUser.userId) {
    return NextResponse.json({ error: "cannot_apply_to_own_event" }, { status: 422 });
  }

  if (event.seats_taken >= event.seats_total) {
    return NextResponse.json({ error: "event_full" }, { status: 409 });
  }

  const { data: blocked } = await admin.rpc("is_blocked_pair", {
    user_a: currentUser.userId,
    user_b: event.organizer_id,
  });
  if (blocked) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }

  const { data: application, error: insertError } = await admin
    .from("applications")
    .insert({ event_id: eventId, user_id: currentUser.userId, status: "pending" })
    .select("id")
    .single();

  if (insertError) {
    // unique constraint (event_id, user_id) — уже откликался
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_applied" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: event.organizer_id,
    type: "new_application",
    payload: { eventId, applicationId: application.id, applicantId: currentUser.userId },
  });

  const { data: organizer } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", event.organizer_id)
    .maybeSingle();
  if (organizer) {
    notifyN8n("new-application", { eventId, telegramId: organizer.telegram_id }).catch(() => {});
  }

  return NextResponse.json({ status: "created", applicationId: application.id });
}
