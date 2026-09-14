import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const NOTIFICATIONS_LIMIT = 50;

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
  if (eventIds.length > 0) {
    const { data: events } = await admin.from("events").select("id, title").in("id", eventIds);
    for (const event of events ?? []) eventTitles.set(event.id, event.title);
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

function buildNotificationText(type: string, eventTitle: string | undefined): string {
  const title = eventTitle ? `«${eventTitle}»` : "встречу";
  switch (type) {
    case "new_application":
      return `Новый отклик на ${title}`;
    case "application_accepted":
      return `Тебя приняли на ${title}`;
    case "event_reminder":
      return `Скоро начнётся ${title}`;
    case "review_request":
      return `Оцени, как прошла ${title}`;
    case "boost_suggestion":
      return `Мало откликов на ${title} — можно поднять её в ленте`;
    case "new_message":
      return "Новое сообщение в чате";
    default:
      return "Новое уведомление";
  }
}
