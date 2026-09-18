import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";

type Action = "accept" | "reject" | "cancel";

/**
 * PATCH /api/applications/[id]
 * Body: { action: "accept" | "reject" | "cancel" }
 *
 * - accept/reject — только организатор встречи (п.14 ТЗ).
 * - cancel — только сам заявитель, отменяет свою заявку.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as Action | undefined;
  if (!action || !["accept", "reject", "cancel"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: application } = await admin
    .from("applications")
    .select("id, event_id, user_id, status, events(organizer_id, title, has_chat)")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const organizerId = (application.events as unknown as { organizer_id: string } | null)?.organizer_id;
  const eventTitle = (application.events as unknown as { title: string } | null)?.title;
  const hasChat = (application.events as unknown as { has_chat: boolean } | null)?.has_chat ?? true;

  if (action === "cancel") {
    if (application.user_id !== currentUser.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (application.status !== "pending") {
      return NextResponse.json({ error: "cannot_cancel_processed_application" }, { status: 422 });
    }
    await admin.from("applications").update({ status: "cancelled" }).eq("id", applicationId);
    return NextResponse.json({ status: "cancelled" });
  }

  // accept / reject — только организатор
  if (organizerId !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (application.status !== "pending") {
    return NextResponse.json({ error: "already_processed" }, { status: 422 });
  }

  if (action === "reject") {
    await admin.from("applications").update({ status: "rejected" }).eq("id", applicationId);
    return NextResponse.json({ status: "rejected" });
  }

  // action === "accept" — атомарно занимаем место, чтобы не превысить seats_total
  const { data: seatAccepted } = await admin.rpc("accept_event_seat", { p_event_id: application.event_id });
  if (!seatAccepted) {
    return NextResponse.json({ error: "event_full" }, { status: 409 });
  }

  await admin.from("applications").update({ status: "accepted" }).eq("id", applicationId);

  await admin.from("event_members").insert({
    event_id: application.event_id,
    user_id: application.user_id,
    role: "participant",
  });

  // Один общий чат на всю встречу — не отдельный чат на каждого принятого
  // человека. Ищем уже существующий (создан при первом принятии на эту
  // встречу) и просто добавляем туда нового участника; если это первое
  // принятие — создаём чат и добавляем организатора.
  //
  // "Для бизнеса" — организатор может явно выбрать НЕ создавать чат (при
  // seats_total <= 20, см. мастер создания) — тогда пропускаем этот блок
  // целиком: люди просто откликаются и получают уведомление, без общего чата.
  if (hasChat) {
    const { data: existingConversation } = await admin
      .from("conversations")
      .select("id")
      .eq("event_id", application.event_id)
      .maybeSingle();

    let conversationId = existingConversation?.id;

    if (!conversationId) {
      const { data: newConversation } = await admin
        .from("conversations")
        .insert({ event_id: application.event_id })
        .select("id")
        .single();
      conversationId = newConversation?.id;
      if (conversationId) {
        await admin.from("conversation_members").insert({ conversation_id: conversationId, user_id: organizerId });
      }
    }

    if (conversationId) {
      await admin.from("conversation_members").insert({ conversation_id: conversationId, user_id: application.user_id });
    }
  }

  await admin.from("notifications").insert({
    user_id: application.user_id,
    type: "application_accepted",
    payload: { eventId: application.event_id, applicationId },
  });

  const { data: participant } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", application.user_id)
    .maybeSingle();
  if (participant) {
    notifyTelegram(participant.telegram_id, buildNotificationText("application_accepted", eventTitle)).catch(
      () => {}
    );
  }

  return NextResponse.json({ status: "accepted" });
}
