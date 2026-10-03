import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";

/**
 * GET /api/events/[id]/ticket
 * «Мой билет» — билет текущего пользователя на бизнес-событие: номер,
 * событие, организатор, чат. Есть только у принятого участника.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const eventId = params.id;

  const [{ data: member }, { data: event }] = await Promise.all([
    admin
      .from("event_members")
      .select("ticket_code, checked_in_at")
      .eq("event_id", eventId)
      .eq("user_id", currentUser.userId)
      .eq("role", "participant")
      .maybeSingle(),
    admin
      .from("events")
      .select(
        "id, title, photo_url, event_date, event_time, event_end_time, place_name, address, latitude, longitude, status, is_business, has_chat, organizer:users(name)"
      )
      .eq("id", eventId)
      .maybeSingle(),
  ]);

  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (!member || !member.ticket_code) return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  const organizer = event.organizer as unknown as { name: string } | null;

  return NextResponse.json({
    ticketCode: member.ticket_code,
    checkedInAt: member.checked_in_at,
    conversationId: conversation?.id ?? null,
    event: {
      id: event.id,
      title: event.title,
      photoUrl: event.photo_url,
      eventDate: event.event_date,
      eventTime: event.event_time,
      eventEndTime: event.event_end_time,
      placeName: event.place_name,
      address: event.address,
      latitude: event.latitude,
      longitude: event.longitude,
      status: event.status,
      organizerName: organizer?.name ?? null,
    },
  });
}

/**
 * DELETE /api/events/[id]/ticket
 * «Отменить участие» — участник сам выходит из события до его начала:
 * билет аннулируется, место освобождается, человек выходит из чата,
 * организатор получает сообщение в Telegram.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const eventId = params.id;

  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id, event_date, event_time")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });

  const eventStartsAt = new Date(`${event.event_date}T${event.event_time}`);
  if (eventStartsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "event_already_started" }, { status: 422 });
  }

  const { data: removed } = await admin
    .from("event_members")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", currentUser.userId)
    .eq("role", "participant")
    .select("id");
  if (!removed || removed.length === 0) return NextResponse.json({ error: "not_a_member" }, { status: 404 });

  await admin
    .from("applications")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .eq("user_id", currentUser.userId)
    .eq("status", "accepted");
  await admin.rpc("release_event_seat", { p_event_id: eventId });

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
      .eq("user_id", currentUser.userId);
  }

  const [{ data: organizer }, { data: me }] = await Promise.all([
    admin.from("users").select("telegram_id").eq("id", event.organizer_id).maybeSingle(),
    admin.from("users").select("name").eq("id", currentUser.userId).maybeSingle(),
  ]);
  if (organizer) {
    await notifyTelegram(
      organizer.telegram_id,
      `😔 ${me?.name ?? "Участник"} отменил(а) участие в «${event.title}». Место снова свободно.`
    ).catch(() => {});
  }

  return NextResponse.json({ status: "cancelled" });
}
