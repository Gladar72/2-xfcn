mkdir -p "components/chat"
cat > "components/chat/ReadTicks.tsx" << 'ENDOFFILE'
// Одна галочка — отправлено, две (зелёные) — собеседник прочитал.
// Общий компонент для MessageBubble (внутри чата) и ChatListItem (список чатов).
export function ReadTicks({ status }: { status: "sent" | "read" }) {
  return (
    <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="shrink-0">
      <path
        d="M1 5.5L4.5 9L10.5 1.5"
        stroke={status === "read" ? "#7CF29A" : "currentColor"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {status === "read" && (
        <path
          d="M5.5 5.5L9 9L15 1.5"
          stroke="#7CF29A"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
ENDOFFILE

mkdir -p "components/chat"
cat > "components/chat/MessageBubble.tsx" << 'ENDOFFILE'
import clsx from "clsx";
import { ReadTicks } from "./ReadTicks";

export interface MessageData {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface MessageBubbleProps {
  message: MessageData;
  isOwn: boolean;
  /** Только для своих сообщений: показать ли и какую галочку. */
  readStatus?: "sent" | "read";
}

export function MessageBubble({ message, isOwn, readStatus }: MessageBubbleProps) {
  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[75%] px-4 py-2.5 text-sm",
          isOwn
            ? "bg-accent text-white rounded-[22px_22px_6px_22px]"
            : "bg-lavender-100 text-ink-900 rounded-[22px_22px_22px_6px]"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <span
          className={clsx(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isOwn ? "text-white/70" : "text-ink-400"
          )}
        >
          {formatTime(message.createdAt)}
          {isOwn && <ReadTicks status={readStatus ?? "sent"} />}
        </span>
      </div>
    </div>
  );
}


function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Сегодня";
  if (isSameDay(date, yesterday)) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
ENDOFFILE

mkdir -p "components/chat"
cat > "components/chat/ChatListItem.tsx" << 'ENDOFFILE'
"use client";

import Link from "next/link";
import { ReadTicks } from "./ReadTicks";

export interface ChatListItemData {
  conversationId: string;
  unreadCount: number;
  isBlocked: boolean;
  eventTitle: string | null;
  eventStatus: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  otherUser: { id: string; name: string; avatar_url: string | null } | null;
  lastMessage: { content: string; createdAt: string; isMine: boolean } | null;
  /** Прочитал ли собеседник наше последнее сообщение (только когда lastMessage.isMine). */
  isLastMessageRead?: boolean;
}

export function ChatListItem({ chat }: { chat: ChatListItemData }) {
  const name = chat.otherUser?.name ?? "Пользователь";
  // Заголовок карточки — название встречи (по референсу это важнее, чем
  // "с кем", ты сначала вспоминаешь ПРО ЧТО был чат), но аватар — всегда
  // фото собеседника: с кем именно ты разговариваешь, должно быть видно
  // сразу, картинка категории для этого не подходит.
  const title = chat.eventTitle ?? name;
  const isUnread = chat.unreadCount > 0;

  const previewText = chat.lastMessage
    ? `${chat.lastMessage.isMine ? "Вы" : name.split(" ")[0]}: ${chat.lastMessage.content}`
    : "Чат создан";

  return (
    <Link
      href={`/chats/${chat.conversationId}`}
      className="flex items-center gap-3 rounded-card bg-white p-3 shadow-card"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-base font-semibold text-ink-600">
        {chat.otherUser?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chat.otherUser.avatar_url} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate ${isUnread ? "font-semibold text-ink-900" : "font-medium text-ink-900"}`}>
            {title}
          </span>
          {chat.lastMessage && (
            <span
              className={`flex shrink-0 items-center gap-1 text-xs ${isUnread ? "font-medium text-accent" : "text-ink-400"}`}
            >
              {chat.lastMessage.isMine && <ReadTicks status={chat.isLastMessageRead ? "read" : "sent"} />}
              {formatListTime(chat.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <p className={`truncate text-sm ${isUnread ? "font-medium text-ink-900" : "text-ink-600"}`}>{previewText}</p>
      </div>

      {isUnread && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-white">
          {chat.unreadCount}
        </span>
      )}
    </Link>
  );
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Вчера";

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) return WEEKDAYS[date.getDay()] ?? "";

  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
ENDOFFILE

mkdir -p "app/api/conversations"
cat > "app/api/conversations/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/conversations
 * Список чатов текущего пользователя (кроме скрытых), с превью последнего
 * сообщения, unread count и данными собеседника (п.15 ТЗ).
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: memberships, error } = await admin
    .from("conversation_members")
    .select(
      `
      conversation_id, unread_count, is_hidden, is_blocked,
      conversations(id, event_id, events(title, status, category:categories(slug, name, emoji)))
      `
    )
    .eq("user_id", currentUser.userId)
    .eq("is_hidden", false)
    .order("conversation_id", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const conversationIds = (memberships ?? []).map((m) => m.conversation_id);
  if (conversationIds.length === 0) return NextResponse.json({ items: [] });

  const [{ data: otherMembers }, { data: lastMessages }] = await Promise.all([
    admin
      .from("conversation_members")
      .select("conversation_id, last_read_at, users(id, name, avatar_url)")
      .in("conversation_id", conversationIds)
      .neq("user_id", currentUser.userId),
    admin
      .from("messages")
      .select("conversation_id, content, created_at, sender_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  const otherMemberByConversation = new Map(
    (otherMembers ?? []).map((m) => [
      m.conversation_id,
      {
        user: m.users as unknown as { id: string; name: string; avatar_url: string | null } | null,
        lastReadAt: m.last_read_at as string | null,
      },
    ])
  );

  const lastMessageByConversation = new Map<
    string,
    { content: string; createdAt: string; isMine: boolean }
  >();
  for (const msg of lastMessages ?? []) {
    if (!lastMessageByConversation.has(msg.conversation_id)) {
      lastMessageByConversation.set(msg.conversation_id, {
        content: msg.content,
        createdAt: msg.created_at,
        isMine: msg.sender_id === currentUser.userId,
      });
    }
  }

  const items = (memberships ?? []).map((m) => {
    const conversation = m.conversations as unknown as {
      id: string;
      event_id: string | null;
      events: {
        title: string;
        status: string;
        category: { slug: string; name: string; emoji: string | null } | null;
      } | null;
    } | null;
    const other = otherMemberByConversation.get(m.conversation_id);
    const lastMessage = lastMessageByConversation.get(m.conversation_id) ?? null;
    // "Прочитано" (двойная зелёная галочка в списке чатов, как в MessageBubble
    // внутри самого чата) имеет смысл только для СВОИХ последних сообщений —
    // для входящих у нас и так есть индикатор непрочитанного (unreadCount).
    const isLastMessageRead =
      !!lastMessage?.isMine && !!other?.lastReadAt && lastMessage.createdAt <= other.lastReadAt;

    return {
      conversationId: m.conversation_id,
      unreadCount: m.unread_count,
      isBlocked: m.is_blocked,
      eventTitle: conversation?.events?.title ?? null,
      eventStatus: conversation?.events?.status ?? null,
      category: conversation?.events?.category ?? null,
      otherUser: other?.user ?? null,
      lastMessage,
      isLastMessageRead,
    };
  });

  // Свежие сообщения — выше в списке
  items.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? "";
    const bTime = b.lastMessage?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({ items });
}
ENDOFFILE

