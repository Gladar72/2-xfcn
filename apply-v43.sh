mkdir -p "lib/notifications"
cat > "lib/notifications/text.ts" << 'ENDOFFILE'
/**
 * Текст уведомления по его типу — используется и на экране "Уведомления"
 * в приложении (app/api/notifications/route.ts), и при отправке того же
 * уведомления в Telegram через бота (lib/telegram/notify.ts) — чтобы
 * формулировка была одна и та же, а не расходилась в двух местах.
 */
export function buildNotificationText(type: string, eventTitle: string | undefined): string {
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
ENDOFFILE

mkdir -p "app/api/notifications"
cat > "app/api/notifications/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNotificationText } from "@/lib/notifications/text";

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
ENDOFFILE

mkdir -p "app/api/conversations/[id]/messages"
cat > "app/api/conversations/[id]/messages/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";

const MESSAGE_HISTORY_LIMIT = 50;

async function assertMembership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string
) {
  const { data } = await admin
    .from("conversation_members")
    .select("id, is_blocked")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/**
 * GET /api/conversations/[id]/messages
 * История сообщений (последние 50, по возрастанию времени) + имя
 * собеседника (для шапки чата и подписи над входящими сообщениями —
 * иначе непонятно "кто кому пишет", особенно когда все сообщения на вид
 * одинаковые).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [{ data: messages, error }, { data: otherMemberRow }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT),
    // Имя и last_read_at собеседника одним запросом: имя — для шапки чата и
    // подписи над входящими сообщениями, last_read_at — для галочек
    // "доставлено"/"прочитано" (сообщение считается прочитанным, если оно
    // старше last_read_at собеседника).
    admin
      .from("conversation_members")
      .select("last_read_at, user:users(id, name, avatar_url)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const otherUser = otherMemberRow?.user as unknown as
    | { id: string; name: string; avatar_url: string | null }
    | null;

  return NextResponse.json({
    // ВАЖНО: преобразуем snake_case из базы (sender_id, created_at) в
    // camelCase (senderId, createdAt), который ждёт фронтенд — раньше эта
    // строка отдавала сырые строки БД напрямую, из-за чего даты не
    // парсились ("Invalid Date") и определение "моё/чужое" сообщение
    // всегда давало false (senderId был undefined) — все сообщения
    // выглядели одинаково.
    messages: (messages ?? [])
      .reverse()
      .map((m) => ({ id: m.id, senderId: m.sender_id, content: m.content, createdAt: m.created_at })),
    otherMemberLastReadAt: otherMemberRow?.last_read_at ?? null,
    otherUser: otherUser ? { id: otherUser.id, name: otherUser.name, avatarUrl: otherUser.avatar_url } : null,
  });
}

/**
 * POST /api/conversations/[id]/messages
 * Body: { content: string }
 * Отправка сообщения. Realtime сам разошлёт INSERT всем подписанным
 * участникам (включая отправителя) — фронтенду не нужно оптимистично
 * добавлять сообщение в UI, оно придёт через подписку.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "empty_message" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "message_too_long" }, { status: 422 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (membership.is_blocked) return NextResponse.json({ error: "blocked" }, { status: 403 });

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: currentUser.userId, content })
    .select("id, created_at")
    .single();

  if (error || !message) return NextResponse.json({ error: "send_failed" }, { status: 500 });

  await admin.rpc("increment_conversation_unread", {
    p_conversation_id: conversationId,
    p_exclude_user_id: currentUser.userId,
  });

  // Уведомляем остальных участников диалога о новом сообщении (кроме
  // отправителя) — иначе у людей нет способа узнать о непрочитанном,
  // кроме как самим зайти в чат.
  const { data: otherMembers } = await admin
    .from("conversation_members")
    .select("user_id, users(telegram_id)")
    .eq("conversation_id", conversationId)
    .neq("user_id", currentUser.userId);

  if (otherMembers && otherMembers.length > 0) {
    await admin.from("notifications").insert(
      otherMembers.map((m) => ({
        user_id: m.user_id,
        type: "new_message",
        payload: { conversationId },
      }))
    );

    // Тот же текст, что и на экране "Уведомления" в приложении — без
    // содержимого самого сообщения (не пересылаем переписку в Telegram).
    const notificationText = buildNotificationText("new_message", undefined);
    await Promise.all(
      otherMembers.map((m) => {
        const telegramId = (m.users as unknown as { telegram_id: number } | null)?.telegram_id;
        if (!telegramId) return Promise.resolve();
        return notifyTelegram(telegramId, notificationText);
      })
    );
  }

  return NextResponse.json({ status: "sent", messageId: message.id, createdAt: message.created_at });
}
ENDOFFILE

mkdir -p "app/api/applications"
cat > "app/api/applications/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";

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
    .select("id, title, organizer_id, status, seats_total, seats_taken")
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
    notifyTelegram(organizer.telegram_id, buildNotificationText("new_application", event.title)).catch(() => {});
  }

  return NextResponse.json({ status: "created", applicationId: application.id });
}
ENDOFFILE

mkdir -p "app/api/applications/[id]"
cat > "app/api/applications/[id]/route.ts" << 'ENDOFFILE'
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
    .select("id, event_id, user_id, status, events(organizer_id, title)")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const organizerId = (application.events as unknown as { organizer_id: string } | null)?.organizer_id;
  const eventTitle = (application.events as unknown as { title: string } | null)?.title;

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

  // Чат создаётся только после подтверждения участия (п.15 ТЗ)
  const { data: conversation } = await admin
    .from("conversations")
    .insert({ event_id: application.event_id })
    .select("id")
    .single();

  if (conversation) {
    await admin.from("conversation_members").insert([
      { conversation_id: conversation.id, user_id: application.user_id },
      { conversation_id: conversation.id, user_id: organizerId },
    ]);
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
ENDOFFILE

mkdir -p "app/api/n8n/due-reminders"
cat > "app/api/n8n/due-reminders/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";

const REMINDER_WINDOW_MINUTES = 15; // n8n дёргает раз в 15 минут — окно должно совпадать с частотой опроса

/**
 * GET /api/n8n/due-reminders
 *
 * Workflow 4 (п.27 ТЗ): "За 2 часа до встречи → reminder".
 * Идемпотентность: помечаем notifications с type='event_reminder', чтобы
 * при повторном опросе n8n (каждые ~15 минут) не отправить одно и то же
 * напоминание дважды.
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() + (120 - REMINDER_WINDOW_MINUTES / 2) * 60 * 1000);
  const windowEnd = new Date(now.getTime() + (120 + REMINDER_WINDOW_MINUTES / 2) * 60 * 1000);

  const { data: events } = await admin
    .from("events")
    .select("id, title, place_name, event_date, event_time, organizer_id")
    .eq("status", "published")
    .gte("event_date", now.toISOString().slice(0, 10))
    .lte("event_date", windowEnd.toISOString().slice(0, 10));

  const dueEvents = (events ?? []).filter((e) => {
    const dt = new Date(`${e.event_date}T${e.event_time}`);
    return dt >= windowStart && dt <= windowEnd;
  });

  if (dueEvents.length === 0) return NextResponse.json({ items: [] });

  const eventIds = dueEvents.map((e) => e.id);

  const [{ data: alreadyNotified }, { data: members }] = await Promise.all([
    admin.from("notifications").select("payload").eq("type", "event_reminder"),
    admin
      .from("event_members")
      .select("event_id, users(id, telegram_id)")
      .in("event_id", eventIds),
  ]);

  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? [])
      .map((n) => (n.payload as { eventId?: string } | null)?.eventId)
      .filter(Boolean)
  );

  const items = dueEvents
    .filter((e) => !alreadyNotifiedEventIds.has(e.id))
    .map((event) => {
      const recipients = (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => m.users as unknown as { id: string; telegram_id: number } | null)
        .filter((u): u is { id: string; telegram_id: number } => !!u);
      return {
        eventId: event.id,
        title: event.title,
        placeName: event.place_name,
        eventTime: event.event_time,
        recipients: recipients.map((r) => r.telegram_id),
      };
    })
    .filter((item) => item.recipients.length > 0);

  // Помечаем как отправленные СРАЗУ (до реального успеха отправки в Telegram)
  // — сознательный компромисс: лучше пропустить редкое напоминание при сбое
  // n8n, чем засыпать пользователя дублями. Возврат к строгой idempotency
  // возможен позже через отдельный статус доставки, если понадобится.
  if (items.length > 0) {
    await admin.from("notifications").insert(
      items.flatMap((item) =>
        (members ?? [])
          .filter((m) => m.event_id === item.eventId)
          .map((m) => ({
            user_id: (m.users as unknown as { id: string } | null)?.id,
            type: "event_reminder",
            payload: { eventId: item.eventId },
          }))
          .filter((n) => n.user_id)
      )
    );

    // Отправляем напрямую через бота (не полагаясь ТОЛЬКО на то, что n8n
    // сам разошлёт сообщения по возвращённому списку items) — так
    // напоминание точно дойдёт, даже если workflow в n8n не настроен.
    await Promise.all(
      items.flatMap((item) => {
        const text = buildNotificationText("event_reminder", item.title);
        return item.recipients.map((telegramId) => notifyTelegram(telegramId, text));
      })
    );
  }

  return NextResponse.json({ items });
}
ENDOFFILE

mkdir -p "app/api/n8n/low-attendance"
cat > "app/api/n8n/low-attendance/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";
import { notifyTelegram } from "@/lib/telegram/notify";
import { buildNotificationText } from "@/lib/notifications/text";

const LOOKAHEAD_HOURS = 24;
const LOW_ATTENDANCE_THRESHOLD = 0.5; // меньше половины мест занято

/**
 * GET /api/n8n/low-attendance
 *
 * Workflow 6 (п.27 ТЗ): "Встреча скоро начинается, но мало участников →
 * предложить организатору использовать boost". Подсказка отправляется
 * только один раз на встречу (idempotency через notifications).
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, event_date, event_time, seats_total, seats_taken, organizer_id, users!events_organizer_id_fkey(telegram_id)")
    .eq("status", "published")
    .gte("event_date", now.toISOString().slice(0, 10))
    .lte("event_date", horizon.toISOString().slice(0, 10));

  const dueSoonLowAttendance = (candidates ?? []).filter((e) => {
    const dt = new Date(`${e.event_date}T${e.event_time}`);
    if (dt < now || dt > horizon) return false;
    return e.seats_taken / e.seats_total < LOW_ATTENDANCE_THRESHOLD;
  });

  if (dueSoonLowAttendance.length === 0) return NextResponse.json({ items: [] });

  const { data: alreadyNotified } = await admin
    .from("notifications")
    .select("payload")
    .eq("type", "boost_suggestion");
  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId).filter(Boolean)
  );

  const items = dueSoonLowAttendance
    .filter((e) => !alreadyNotifiedEventIds.has(e.id))
    .map((e) => ({
      eventId: e.id,
      title: e.title,
      seatsTaken: e.seats_taken,
      seatsTotal: e.seats_total,
      organizerTelegramId: (e.users as unknown as { telegram_id: number } | null)?.telegram_id,
    }))
    .filter((item) => Boolean(item.organizerTelegramId));

  if (items.length > 0) {
    await admin.from("notifications").insert(
      dueSoonLowAttendance
        .filter((e) => items.some((i) => i.eventId === e.id))
        .map((e) => ({
          user_id: e.organizer_id,
          type: "boost_suggestion",
          payload: { eventId: e.id },
        }))
    );

    // Отправляем напрямую через бота — та же логика, что и в due-reminders:
    // не полагаемся исключительно на то, что n8n сам разошлёт по items.
    await Promise.all(
      items.map((item) =>
        notifyTelegram(item.organizerTelegramId!, buildNotificationText("boost_suggestion", item.title))
      )
    );
  }

  return NextResponse.json({ items });
}
ENDOFFILE

