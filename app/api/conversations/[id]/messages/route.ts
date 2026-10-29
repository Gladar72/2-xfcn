import { NextRequest, NextResponse } from "next/server";
import { runInBackground } from "@/lib/server/background";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { InlineKeyboard } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { broadcastToConversation } from "@/lib/supabase/broadcast";
import { uploadChatPhoto } from "@/lib/photos/upload-chat-photo";
import { sendPushPersonal } from "@/lib/push/expo";
import { parseSticker } from "@/lib/chat/invite";
import { anonAlias } from "@/lib/events/anonymity";

const MESSAGE_HISTORY_LIMIT = 50;
const MAX_PAGE = 100;

const MESSAGE_COLS = "id, sender_id, content, image_url, created_at, reply_to_id, edited_at, deleted_at";

interface RawMessage {
  id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
}

/**
 * Сообщения → формат для клиента: ответ (цитата), правка, удаление, реакции.
 * Удалённое сообщение отдаём без текста и фото — только отметку «удалено».
 */
async function shapeMessages(admin: ReturnType<typeof createAdminClient>, rows: RawMessage[], viewerId: string) {
  const ids = rows.map((m) => m.id);
  const replyIds = [...new Set(rows.map((m) => m.reply_to_id).filter((x): x is string => !!x))];
  const [{ data: reactionRows }, { data: replyRows }] = await Promise.all([
    ids.length
      ? admin.from("message_reactions").select("message_id, user_id, emoji").in("message_id", ids)
      : Promise.resolve({ data: [] as { message_id: string; user_id: string; emoji: string }[] }),
    replyIds.length
      ? admin.from("messages").select("id, sender_id, content, image_url, deleted_at").in("id", replyIds)
      : Promise.resolve({ data: [] as { id: string; sender_id: string; content: string | null; image_url: string | null; deleted_at: string | null }[] }),
  ]);
  const reactionsByMessage = new Map<string, { emoji: string; userIds: string[] }[]>();
  for (const r of reactionRows ?? []) {
    const list = reactionsByMessage.get(r.message_id as string) ?? [];
    const found = list.find((x) => x.emoji === r.emoji);
    if (found) found.userIds.push(r.user_id as string);
    else list.push({ emoji: r.emoji as string, userIds: [r.user_id as string] });
    reactionsByMessage.set(r.message_id as string, list);
  }
  const replies = new Map((replyRows ?? []).map((r) => [r.id as string, r]));
  return rows.map((m) => {
    const deleted = !!m.deleted_at;
    const reply = m.reply_to_id ? replies.get(m.reply_to_id) : undefined;
    return {
      id: m.id,
      senderId: m.sender_id,
      content: deleted ? "" : m.content ?? "",
      imageUrl: deleted ? null : m.image_url ?? null,
      createdAt: m.created_at,
      editedAt: m.edited_at,
      deleted,
      replyTo: reply
        ? {
            id: reply.id as string,
            senderId: reply.sender_id as string,
            content: reply.deleted_at ? "" : ((reply.content as string | null) ?? "").slice(0, 200),
            imageUrl: reply.deleted_at ? null : (reply.image_url as string | null),
            deleted: !!reply.deleted_at,
          }
        : null,
      reactions: (reactionsByMessage.get(m.id) ?? []).map((r) => ({
        emoji: r.emoji,
        count: r.userIds.length,
        mine: r.userIds.includes(viewerId),
        userIds: r.userIds,
      })),
    };
  });
}

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

/** Возраст по дате рождения (лет, целиком) — тот же способ счёта, что и везде в проекте. */
function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * GET /api/conversations/[id]/messages
 * История сообщений (последние 50, по возрастанию времени) + название
 * встречи и список ОСТАЛЬНЫХ участников (для шапки группового чата и
 * подписи над входящими сообщениями — теперь участников может быть
 * несколько, не только один собеседник, как раньше). Дополнительно — кто
 * организатор, возраст, пол и число посещённых встреч каждого участника
 * (для раскрывающегося списка "Участники события", см. запрос пользователя).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Если событие уже прошло или отменено — в чат вообще нельзя зайти
  // (не только нельзя писать), см. явное требование пользователя.
  const { data: eventCheckRow } = await admin
    .from("conversations")
    .select("events(status)")
    .eq("id", conversationId)
    .maybeSingle();
  const eventCheckStatus = (eventCheckRow?.events as unknown as { status: string } | null)?.status;
  // ?readonly=1 — мобильное приложение показывает архив закрытых чатов (только чтение).
  const readonly = req.nextUrl.searchParams.get("readonly") === "1";
  if (!readonly && (eventCheckStatus === "completed" || eventCheckStatus === "cancelled")) {
    return NextResponse.json({ error: "event_closed" }, { status: 403 });
  }

  // Подгрузка старых сообщений при прокрутке вверх: ?before=<createdAt>&limit=50.
  const before = req.nextUrl.searchParams.get("before");
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(MAX_PAGE, Math.floor(limitParam)) : MESSAGE_HISTORY_LIMIT;
  let messagesQuery = admin
    .from("messages")
    .select(MESSAGE_COLS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (before && !Number.isNaN(Date.parse(before))) messagesQuery = messagesQuery.lt("created_at", new Date(before).toISOString());

  const [{ data: messages, error }, { data: otherMemberRows }, { data: conversationRow }] = await Promise.all([
    messagesQuery,
    // Все ОСТАЛЬНЫЕ участники (не только один, как раньше) — имя, фото,
    // возраст, пол и число посещённых встреч для списка "Участники
    // события", last_read_at каждого для галочек "прочитано" (сообщение
    // считается прочитанным только когда ВСЕ остальные участники его
    // увидели — логично для группового чата).
    admin
      .from("conversation_members")
      .select("last_read_at, user:users(id, name, avatar_url, birth_date, gender, completed_meetings_count, last_active_at)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId),
    admin
      .from("conversations")
      .select("event_id, events(title, status, is_business, organizer_id, photo_url, event_date, event_time, place_name, address, is_anonymous, category:categories(slug, name, emoji))")
      .eq("id", conversationId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  interface RawMemberUser {
    id: string;
    name: string;
    avatar_url: string | null;
    birth_date: string | null;
    gender: string | null;
    completed_meetings_count: number | null;
    last_active_at: string | null;
  }

  // Анонимная встреча: настоящие профили видят только организатор и одобренный
  // участник друг у друга; другие участники — условное имя без фото.
  const anonEvent = conversationRow?.events as unknown as { is_anonymous: boolean | null; organizer_id: string | null } | null;
  const anonEventId = (conversationRow as { event_id?: string | null } | null)?.event_id ?? null;
  const viewerIsOrganizer = anonEvent?.organizer_id === currentUser.userId;

  const members = (otherMemberRows ?? [])
    .map((row) => {
      const user = row.user as unknown as RawMemberUser | null;
      if (!user) return null;
      if (anonEvent?.is_anonymous && anonEventId && !viewerIsOrganizer && user.id !== anonEvent.organizer_id) {
        return {
          id: user.id,
          name: anonAlias(anonEventId, user.id, user.gender),
          avatarUrl: null,
          age: null,
          gender: user.gender,
          completedMeetingsCount: 0,
          lastReadAt: row.last_read_at as string | null,
          lastActiveAt: null,
          anonymous: true,
        };
      }
      return {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatar_url,
        age: calcAge(user.birth_date),
        gender: user.gender,
        completedMeetingsCount: user.completed_meetings_count ?? 0,
        lastReadAt: row.last_read_at as string | null,
        lastActiveAt: user.last_active_at ?? null,
      };
    })
    .filter((m): m is NonNullable<typeof m> => !!m);

  const eventInfo = conversationRow?.events as unknown as {
    title: string;
    status: string;
    is_business: boolean;
    organizer_id: string | null;
    photo_url: string | null;
    event_date: string | null;
    event_time: string | null;
    place_name: string | null;
    address: string | null;
    category: { slug: string; name: string; emoji: string | null } | null;
  } | null;

  const rawRows = (messages ?? []) as unknown as RawMessage[];
  const hasMore = rawRows.length > limit;
  const page = rawRows.slice(0, limit).reverse();
  const shaped = await shapeMessages(admin, page, currentUser.userId);

  return NextResponse.json({
    // ВАЖНО: преобразуем snake_case из базы (sender_id, created_at) в
    // camelCase (senderId, createdAt), который ждёт фронтенд — раньше эта
    // строка отдавала сырые строки БД напрямую, из-за чего даты не
    // парсились ("Invalid Date") и определение "моё/чужое" сообщение
    // всегда давало false (senderId был undefined) — все сообщения
    // выглядели одинаково.
    messages: shaped,
    hasMore,
    eventTitle: eventInfo?.title ?? null,
    eventStatus: eventInfo?.status ?? null,
    category: eventInfo?.category ?? null,
    isBusiness: eventInfo?.is_business ?? false,
    organizerId: eventInfo?.organizer_id ?? null,
    eventPhotoUrl: eventInfo?.photo_url ?? null,
    eventId: (conversationRow as { event_id?: string | null } | null)?.event_id ?? null,
    eventDate: eventInfo?.event_date ?? null,
    eventTime: eventInfo?.event_time ?? null,
    eventPlace: eventInfo?.place_name ?? null,
    eventAddress: eventInfo?.address ?? null,
    members,
  });
}

/**
 * POST /api/conversations/[id]/messages
 * Body: { content: string; image?: string (data URL фото) }
 * Отправка сообщения. После сохранения сервер сам рассылает его в канал
 * чата через Realtime Broadcast (см. lib/supabase/broadcast.ts).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  // Фото (необязательно) — data URL, уже ужатый телефоном; с ним текст
  // можно не писать (подпись к фото необязательна, как в Telegram).
  const imageDataUrl = typeof body?.image === "string" ? body.image : null;
  const replyToId = typeof body?.replyToId === "string" && /^[0-9a-f-]{36}$/i.test(body.replyToId) ? body.replyToId : null;
  if (!content && !imageDataUrl) return NextResponse.json({ error: "empty_message" }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "message_too_long" }, { status: 422 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (membership.is_blocked) return NextResponse.json({ error: "blocked" }, { status: 403 });

  // Если событие уже прошло или отменено — чат закрывается на отправку
  // новых сообщений (переписку по-прежнему можно читать и открывать).
  const { data: conversationRow } = await admin
    .from("conversations")
    .select("events(status)")
    .eq("id", conversationId)
    .maybeSingle();
  const eventStatus = (conversationRow?.events as unknown as { status: string } | null)?.status;
  if (eventStatus === "completed" || eventStatus === "cancelled") {
    return NextResponse.json({ error: "event_closed" }, { status: 422 });
  }

  // Фото загружаем только после всех проверок доступа выше.
  let imageUrl: string | null = null;
  if (imageDataUrl) {
    const upload = await uploadChatPhoto(admin, conversationId, imageDataUrl);
    if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: 422 });
    imageUrl = upload.publicUrl;
  }

  // Ответ — только на сообщение из этого же чата.
  let replyTo: { id: string; senderId: string; content: string; imageUrl: string | null; deleted: boolean } | null = null;
  if (replyToId) {
    const { data: orig } = await admin
      .from("messages")
      .select("id, sender_id, content, image_url, deleted_at")
      .eq("id", replyToId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (orig) {
      replyTo = {
        id: orig.id as string,
        senderId: orig.sender_id as string,
        content: orig.deleted_at ? "" : ((orig.content as string | null) ?? "").slice(0, 200),
        imageUrl: orig.deleted_at ? null : (orig.image_url as string | null),
        deleted: !!orig.deleted_at,
      };
    }
  }

  const { data: message, error } = await admin
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: currentUser.userId, content, image_url: imageUrl, reply_to_id: replyTo?.id ?? null })
    .select("id, created_at")
    .single();

  if (error || !message) return NextResponse.json({ error: "send_failed" }, { status: 500 });

  // Сразу рассылаем сообщение всем, у кого открыт этот чат (Broadcast),
  // параллельно со счётчиком непрочитанных.
  await Promise.all([
    broadcastToConversation(conversationId, "message", {
      id: message.id,
      senderId: currentUser.userId,
      content,
      imageUrl,
      createdAt: message.created_at,
      replyTo,
      editedAt: null,
      deleted: false,
      reactions: [],
    }),
    admin.rpc("increment_conversation_unread", {
      p_conversation_id: conversationId,
      p_exclude_user_id: currentUser.userId,
    }),
  ]);

  // Уведомления (push, Telegram) — фоном ПОСЛЕ ответа: отправитель сразу
  // получает id сообщения, и галочка «отправлено» не ждёт рассылки.
  await runInBackground(async () => {
    // Уведомляем остальных участников диалога о новом сообщении (кроме
    // отправителя) — иначе у людей нет способа узнать о непрочитанном,
    // кроме как самим зайти в чат.
    const { data: otherMembers } = await admin
      .from("conversation_members")
      .select("user_id, is_blocked, last_read_at, users(telegram_id)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId);

    if (otherMembers && otherMembers.length > 0) {
      // В «Уведомлениях» — одна строка на чат, пока её не прочитали: новое сообщение
      // поднимает её наверх, а не добавляет ещё одну (раньше набегало по 20–25 штук).
      const memberIds = otherMembers.map((m) => m.user_id as string);
      const { data: unreadRows } = await admin
        .from("notifications")
        .select("id, user_id")
        .eq("type", "new_message")
        .eq("is_read", false)
        .eq("payload->>conversationId", conversationId)
        .in("user_id", memberIds);
      const hasUnread = new Set((unreadRows ?? []).map((r) => r.user_id as string));
      if (unreadRows && unreadRows.length > 0) {
        await admin
          .from("notifications")
          .update({ created_at: new Date().toISOString() })
          .in("id", unreadRows.map((r) => r.id as string));
      }
      const fresh = memberIds.filter((id) => !hasUnread.has(id));
      if (fresh.length > 0) {
        await admin.from("notifications").insert(fresh.map((user_id) => ({ user_id, type: "new_message", payload: { conversationId } })));
      }

      // Уведомление в Telegram с кнопкой «Открыть чат»: от организатора — с
      // именем и текстом, от остальных — «Новое сообщение в чате». Не шлём тем, кто заблокировал чат, и тем, у
      // кого чат открыт прямо сейчас (отметил прочитанным за последние 20 с).
      const [{ data: sender }, { data: conv }] = await Promise.all([
        admin.from("users").select("name, gender").eq("id", currentUser.userId).maybeSingle(),
        admin.from("conversations").select("event_id, events(title, organizer_id, is_anonymous)").eq("id", conversationId).maybeSingle(),
      ]);
      const convEvent = conv?.events as unknown as { title: string; organizer_id: string; is_anonymous: boolean | null } | null;
      // Анонимная встреча: участник для остальных — условное имя (организатора участники видят).
      const senderName =
        convEvent?.is_anonymous && convEvent.organizer_id !== currentUser.userId && conv?.event_id
          ? anonAlias(conv.event_id as string, currentUser.userId, sender?.gender as string | null)
          : (sender?.name as string | undefined)?.trim() || "Участник";
      const chatTitle = convEvent?.title ?? null;
      // Текст сообщения показываем, только если пишет организатор встречи.
      // Сообщения остальных участников — просто «Новое сообщение в чате».
      const fromOrganizer = !!convEvent && convEvent.organizer_id === currentUser.userId;
      const base = parseSticker(content) ? "Стикер" : content;
      const preview = base
        ? base.length > 600
          ? `${base.slice(0, 597)}…`
          : base
        : "📷 Фото";
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const text = !convEvent
        ? // Личный чат: имя и текст, как в обычном мессенджере.
          `💬 <b>${esc(senderName)}</b>\n\n${esc(preview)}`
        : fromOrganizer
        ? `📣 <b>${esc(senderName)}</b> (организатор)` +
          (chatTitle ? ` · ${esc(chatTitle)}` : "") +
          `\n\n${esc(preview)}` +
          (content && imageUrl ? "\n📷 + фото" : "")
        : `💬 Новое сообщение в чате${chatTitle ? ` «${esc(chatTitle)}»` : ""}`;
      const appUrl = process.env.APP_URL;
      const keyboard = appUrl
        ? new InlineKeyboard().webApp("💬 Открыть чат", `${appUrl}?goto=chat_${conversationId}`)
        : undefined;
      const now = Date.now();

      // Push в мобильное приложение — тем же получателям, что и Telegram
      // (не заблокировавшим чат и не читающим его прямо сейчас). Один запрос
      // токенов на всех получателей + пачка в Expo.
      const shortPreview = preview.length > 150 ? `${preview.slice(0, 149)}…` : preview;
      const pushTitle = !convEvent ? senderName : chatTitle ?? "Чат встречи";
      const pushBody = !convEvent
        ? shortPreview
        : fromOrganizer
        ? `${senderName} (организатор): ${shortPreview}`
        : `Новое сообщение от ${senderName}`;
      const pushRecipients = otherMembers
        .filter((m) => !m.is_blocked)
        .filter((m) => !(m.last_read_at && now - new Date(m.last_read_at as string).getTime() < 20_000))
        .map((m) => m.user_id as string);
      const pushPromise = sendPushPersonal(
        admin,
        pushRecipients.map((userId) => ({
          userId,
          message: {
            title: pushTitle,
            body: pushBody,
            data: { url: `/chat/${conversationId}`, type: "new_message", conversationId },
          },
        }))
      );

      await Promise.all([
        pushPromise,
        ...otherMembers.map(async (m) => {
          const telegramId = (m.users as unknown as { telegram_id: number } | null)?.telegram_id;
          if (!telegramId || m.is_blocked) return;
          if (m.last_read_at && now - new Date(m.last_read_at as string).getTime() < 20_000) return;
          try {
            await getBot().api.sendMessage(telegramId, text, {
              parse_mode: "HTML",
              reply_markup: keyboard,
              link_preview_options: { is_disabled: true },
            });
          } catch (err) {
            console.error(`chat notify — не удалось отправить ${telegramId}:`, err);
          }
        }),
      ]);
    }
  });

  return NextResponse.json({ status: "sent", messageId: message.id, createdAt: message.created_at, imageUrl });
}
