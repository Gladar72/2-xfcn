import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";

/**
 * DELETE /api/events/[id]/members/[userId]
 *
 * Организатор убирает уже принятого участника ДО начала встречи (не после —
 * иначе можно было бы «уводить» людей с уже прошедших встреч задним числом,
 * искажая счётчик посещённых встреч и рейтинг). Освобождает место —
 * release_event_seat сам решает, возвращать ли встречу в 'published', если
 * она была закрыта именно из-за заполненности (см. миграцию 0023).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id: eventId, userId: memberUserId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, title, event_date, event_time, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (memberUserId === currentUser.userId) {
    return NextResponse.json({ error: "cannot_remove_organizer" }, { status: 422 });
  }

  const eventStartsAt = new Date(`${event.event_date}T${event.event_time}`);
  if (eventStartsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "event_already_started" }, { status: 422 });
  }

  const { data: application } = await admin
    .from("applications")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", memberUserId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!application) return NextResponse.json({ error: "not_a_member" }, { status: 404 });

  await admin.from("applications").update({ status: "removed" }).eq("id", application.id);
  await admin.from("event_members").delete().eq("event_id", eventId).eq("user_id", memberUserId);
  await admin.rpc("release_event_seat", { p_event_id: eventId });

  // Убираем и из общего группового чата встречи — иначе человек остаётся в
  // переписке, хотя из самой встречи его уже исключили.
  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (conversation) {
    await admin
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", memberUserId);
  }

  const { data: removedUser } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", memberUserId)
    .maybeSingle();
  if (removedUser) {
    notifyTelegram(removedUser.telegram_id, `Организатор убрал тебя из встречи «${event.title}».`).catch(() => {});
  }

  return NextResponse.json({ status: "removed" });
}
