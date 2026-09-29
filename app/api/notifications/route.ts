import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNotificationText } from "@/lib/notifications/text";

const NOTIFICATIONS_LIMIT = 50;

interface NotificationEvent {
  id: string;
  title: string;
  photoUrl: string | null;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  address: string | null;
  isBusiness: boolean;
  status: string;
}

/**
 * GET /api/notifications
 * Список уведомлений текущего пользователя с готовым для показа текстом.
 * Уведомления сами по себе (таблица notifications) хранят только type +
 * payload (jsonb с id-шниками) — здесь мы "досказываем" их до читаемой
 * строки, подтягивая названия встреч и т.п. одним пакетным запросом,
 * а не по одному на каждое уведомление.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: notifications, error } = await admin
    .from("notifications")
    .select("id, type, payload, is_read, created_at")
    .eq("user_id", currentUser.userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_LIMIT);

  if (error) {
    console.error("GET /api/notifications — ошибка запроса:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const items = notifications ?? [];

  const eventIds = Array.from(
    new Set(
      items
        .map((n) => (n.payload as Record<string, unknown>)?.eventId)
        .filter((id): id is string => typeof id === "string")
    )
  );

  const eventTitles = new Map<string, string>();
  const eventCards = new Map<string, NotificationEvent>();
  const ticketCodes = new Map<string, string>();
  const conversationIds = new Map<string, string>();
  if (eventIds.length > 0) {
    // Всё для «богатых» карточек (Ты в деле! / Встречаемся через 2 часа):
    // фото, дата, место, номер билета и чат — одним пакетом, не по одному.
    const [{ data: events }, { data: myMemberships }, { data: conversations }] = await Promise.all([
      admin
        .from("events")
        .select("id, title, photo_url, event_date, event_time, place_name, address, is_business, status")
        .in("id", eventIds),
      admin
        .from("event_members")
        .select("event_id, ticket_code")
        .eq("user_id", currentUser.userId)
        .in("event_id", eventIds),
      admin.from("conversations").select("id, event_id").in("event_id", eventIds),
    ]);
    for (const event of events ?? []) {
      eventTitles.set(event.id, event.title);
      eventCards.set(event.id, {
        id: event.id,
        title: event.title,
        photoUrl: event.photo_url,
        eventDate: event.event_date,
        eventTime: event.event_time,
        placeName: event.place_name,
        address: event.address,
        isBusiness: event.is_business,
        status: event.status,
      });
    }
    for (const m of myMemberships ?? []) if (m.ticket_code) ticketCodes.set(m.event_id, m.ticket_code);
    const memberOf = new Set((myMemberships ?? []).map((m) => m.event_id));
    for (const c of conversations ?? []) if (memberOf.has(c.event_id)) conversationIds.set(c.event_id, c.id);
  }

  const result = items.map((n) => {
    const payload = n.payload as Record<string, unknown>;
    const eventId = typeof payload?.eventId === "string" ? payload.eventId : null;
    const eventTitle = eventId ? eventTitles.get(eventId) : undefined;

    return {
      id: n.id,
      type: n.type,
      isRead: n.is_read,
      createdAt: n.created_at,
      text: buildNotificationText(n.type, eventTitle),
      linkEventId: eventId,
      linkConversationId: typeof payload?.conversationId === "string" ? payload.conversationId : null,
      event: eventId ? eventCards.get(eventId) ?? null : null,
      ticketCode: eventId ? ticketCodes.get(eventId) ?? null : null,
      eventConversationId: eventId ? conversationIds.get(eventId) ?? null : null,
    };
  });

  return NextResponse.json({ items: result });
}

/**
 * PATCH /api/notifications
 * Отмечает все уведомления пользователя прочитанными (вызывается при
 * открытии экрана уведомлений).
 */
export async function PATCH(_req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", currentUser.userId)
    .eq("is_read", false);

  return NextResponse.json({ status: "ok" });
}
