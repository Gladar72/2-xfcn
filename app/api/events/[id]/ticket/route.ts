import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser, shortTitle } from "@/lib/notify/user";
import { eventTiming } from "@/lib/events/timing";

/**
 * GET /api/events/[id]/ticket
 * «Мой билет» — билет текущего пользователя на бизнес-событие: номер,
 * событие, организатор, чат. Есть только у принятого участника.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient({noStore:true});
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
        "id, title, photo_url, event_date, event_time, event_end_time, city, place_name, address, latitude, longitude, status, is_business, has_chat, business_pricing_type, business_pricing_details, organizer:users(name)"
      )
      .eq("id", eventId)
      .maybeSingle(),
  ]);

  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });


  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  const paidOrder = await admin.from("ticket_orders").select("id,state,price_kopecks,qr_token,accepted_terms,purchase_terms,full_refund_before_start,purchased_start,refund_requested_at,refund_receipt_number,archived_code")
    .eq("event_id",eventId).eq("user_id",currentUser.userId).in("state",["paid","refunded","refund_pending","refund_review"]).maybeSingle();
  if (paidOrder.error) return NextResponse.json({error:"ticket_unavailable"},{status:503});
  const o = paidOrder.data;
  if (!member?.ticket_code && !o) return NextResponse.json({error:"ticket_not_found"},{status:404});
  const start = eventTiming(event).start.getTime();
  const moved = !!o?.purchased_start && Date.parse(o.purchased_start) !== start;
  const active = ["published","closed"].includes(event.status);
  const canRefund = o?.state === "paid" && !member?.checked_in_at && active &&
    Date.now()<start && (moved || o.full_refund_before_start);
  const inquiry = o ? await admin.from("support_tickets").select("created_at,admin_reply").eq("ticket_order_id",o.id)
    .eq("user_id",currentUser.userId).order("created_at",{ascending:false}).limit(1).maybeSingle() : null;
  const organizer = event.organizer as unknown as { name: string } | null;

  return NextResponse.json({
    ticketCode: member?.ticket_code || o?.archived_code || o?.id,
    refund: o ? {state:event.status === "cancelled" && o.state==="paid" ? "refund_pending" : o.state,canRefund,
      requestedAt:o.refund_requested_at,terms:o.accepted_terms || o.purchase_terms,receiptNumber:o.refund_receipt_number,
      inquiry:inquiry?.data ?? null} : null,
    paidKopecks: paidOrder.data?.price_kopecks ?? null,
    qrImage: o?.state === "paid" && active && !member?.checked_in_at ? await QRCode.toDataURL(o.qr_token, { width: 320, margin: 4 }) : null,
    checkedInAt: member?.checked_in_at ?? null,
    conversationId: member && active && (!o || o.state === "paid") ? conversation?.id ?? null : null,
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
      businessPricingType: (event as { business_pricing_type?: string | null }).business_pricing_type ?? null,
      businessPricingDetails: (event as { business_pricing_details?: string | null }).business_pricing_details ?? null,
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

  const admin = createAdminClient({noStore:true});
  const eventId = params.id;

  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id, event_date, event_time, event_end_time, city, longitude")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });

  // Начало — по часовому поясу города встречи, а не по UTC сервера.
  const eventStartsAt = eventTiming(event).start;
  if (eventStartsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "event_already_started" }, { status: 422 });
  }

  const online = await admin.from("ticket_orders").select("id").eq("event_id", eventId).eq("user_id", currentUser.userId).maybeSingle();
  if (online.error || online.data) return NextResponse.json({ error: "ticket_support_required", message: "Для отмены оплаченного билета обратись в поддержку." }, { status: 409 });

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
  await notifyUser(admin, event.organizer_id, {
    title: "Участник не придёт",
    body: `${me?.name ?? "Участник"} отменил(а) участие в «${shortTitle(event.title)}». Место снова свободно`,
    url: `/event/${eventId}`,
    data: { type: "participant_left", eventId },
    telegramText: `😔 ${me?.name ?? "Участник"} отменил(а) участие в «${event.title}». Место снова свободно.`,
    telegramId: organizer?.telegram_id ?? null,
  });

  return NextResponse.json({ status: "cancelled" });
}
