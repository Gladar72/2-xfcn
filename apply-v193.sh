mkdir -p "app/api/conversations"
cat > "app/api/conversations/route.ts" << 'FILE1_EOF'
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
      conversation_id, unread_count, is_hidden, is_blocked, is_favorite,
      conversations(id, event_id, created_at, events(title, status, is_business, photo_url, category:categories(slug, name, emoji)))
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

  const otherMembersByConversation = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null }[]
  >();
  for (const m of otherMembers ?? []) {
    const user = m.users as unknown as { id: string; name: string; avatar_url: string | null } | null;
    if (!user) continue;
    const list = otherMembersByConversation.get(m.conversation_id) ?? [];
    list.push({ id: user.id, name: user.name, avatarUrl: user.avatar_url, lastReadAt: m.last_read_at as string | null });
    otherMembersByConversation.set(m.conversation_id, list);
  }

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
      created_at: string;
      events: {
        title: string;
        status: string;
        is_business: boolean;
        photo_url: string | null;
        category: { slug: string; name: string; emoji: string | null } | null;
      } | null;
    } | null;
    const otherMembersList = otherMembersByConversation.get(m.conversation_id) ?? [];
    const lastMessage = lastMessageByConversation.get(m.conversation_id) ?? null;
    // "Прочитано" (двойная зелёная галочка в списке чатов, как в MessageBubble
    // внутри самого чата) имеет смысл только для СВОИХ последних сообщений —
    // для входящих у нас и так есть индикатор непрочитанного (unreadCount).
    // В групповом чате считаем прочитанным только когда ВСЕ остальные
    // участники увидели сообщение.
    const isLastMessageRead =
      !!lastMessage?.isMine &&
      otherMembersList.length > 0 &&
      otherMembersList.every((om) => om.lastReadAt && lastMessage.createdAt <= om.lastReadAt);

    return {
      conversationId: m.conversation_id,
      unreadCount: m.unread_count,
      isBlocked: m.is_blocked,
      isFavorite: m.is_favorite,
      eventTitle: conversation?.events?.title ?? null,
      eventStatus: conversation?.events?.status ?? null,
      eventPhotoUrl: conversation?.events?.photo_url ?? null,
      category: conversation?.events?.category ?? null,
      isBusiness: conversation?.events?.is_business ?? false,
      // otherUser — для отображения аватара в списке: если участник один
      // (как раньше), показываем его фото; если несколько — компонент сам
      // решает показать иконку группы (см. otherMembersCount).
      otherUser: otherMembersList[0] ?? null,
      otherMembersCount: otherMembersList.length,
      lastMessage,
      isLastMessageRead,
      // Для сортировки — если сообщений в чате ещё нет (только что создан),
      // раньше здесь была "" (пустая строка), которая как самая ранняя
      // дата всегда тонула в самый низ списка. Теперь используем момент
      // создания САМОГО чата — новый чат без сообщений корректно окажется
      // сверху, как самый свежий, а не в самом низу.
      _sortKey: lastMessage?.createdAt ?? conversation?.created_at ?? "",
    };
  });

  // Свежие сообщения (или свежесозданные чаты без сообщений) — выше в списке
  items.sort((a, b) => b._sortKey.localeCompare(a._sortKey));

  return NextResponse.json({ items: items.map(({ _sortKey, ...rest }) => rest) });
}
FILE1_EOF
mkdir -p "components/chat"
cat > "components/chat/ChatListItem.tsx" << 'FILE2_EOF'
"use client";

import Link from "next/link";
import Image from "next/image";
import { ReadTicks } from "./ReadTicks";
import { CATEGORY_ICON } from "@/lib/data/category-icons";

export interface ChatListItemData {
  conversationId: string;
  unreadCount: number;
  isBlocked: boolean;
  isFavorite: boolean;
  eventTitle: string | null;
  eventStatus: string | null;
  /** Фото события — если есть, показываем ЕГО как аватарку чата вместо иконки категории. */
  eventPhotoUrl?: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  isBusiness: boolean;
  otherUser: { id: string; name: string; avatarUrl: string | null } | null;
  /** Сколько всего человек в чате, кроме меня — 1 = обычный диалог, больше 1 = групповой чат встречи. */
  otherMembersCount: number;
  lastMessage: { content: string; createdAt: string; isMine: boolean } | null;
  /** Прочитали ли ВСЕ остальные участники наше последнее сообщение (только когда lastMessage.isMine). */
  isLastMessageRead?: boolean;
}

export function ChatListItem({
  chat,
  onToggleFavorite,
}: {
  chat: ChatListItemData;
  onToggleFavorite: (conversationId: string, next: boolean) => void;
}) {
  const categoryIcon = chat.isBusiness ? "/brand/markers/marker-business.png" : chat.category ? CATEGORY_ICON[chat.category.slug] : undefined;
  const isEventClosed = chat.eventStatus === "completed" || chat.eventStatus === "cancelled";
  const name = chat.otherUser?.name ?? "Пользователь";
  // Заголовок карточки — название встречи (по референсу это важнее, чем
  // "с кем", ты сначала вспоминаешь ПРО ЧТО был чат) — теперь так вообще
  // всегда, раз чат один на всю встречу, а не на человека.
  const title = chat.eventTitle ?? name;
  const isUnread = chat.unreadCount > 0;

  const previewText = chat.lastMessage
    ? `${chat.lastMessage.isMine ? "Вы" : name.split(" ")[0]}: ${chat.lastMessage.content}`
    : "Чат создан";

  const chatBody = (
    <>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-base font-semibold text-ink-600">
        {chat.eventPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chat.eventPhotoUrl} alt="" className="h-full w-full object-cover" />
        ) : chat.category ? (
          categoryIcon ? (
            <Image src={categoryIcon} alt="" width={28} height={28} className="object-contain" />
          ) : (
            <span className="text-xl">{chat.category.emoji ?? "💬"}</span>
          )
        ) : chat.otherUser?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chat.otherUser.avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate ${isUnread ? "font-semibold text-ink-900" : "font-medium text-ink-900"}`}>
            {title}
          </span>
          {isEventClosed ? (
            <span className="shrink-0 text-xs text-ink-400">Событие закрыто</span>
          ) : (
            chat.lastMessage && (
              <span
                className={`flex shrink-0 items-center gap-1 text-xs ${isUnread ? "font-medium text-accent" : "text-ink-400"}`}
              >
                {chat.lastMessage.isMine && <ReadTicks status={chat.isLastMessageRead ? "read" : "sent"} />}
                {formatListTime(chat.lastMessage.createdAt)}
              </span>
            )
          )}
        </div>
        <p className={`truncate text-sm ${isUnread ? "font-medium text-ink-900" : "text-ink-600"}`}>{previewText}</p>
      </div>

      {isUnread && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-white">
          {chat.unreadCount}
        </span>
      )}
    </>
  );

  return (
    <div className={`flex items-center gap-2 rounded-card bg-white p-3 shadow-card ${isEventClosed ? "opacity-60" : ""}`}>
      {isEventClosed ? (
        // Закрытая встреча — в чат вообще нельзя зайти (не просто нельзя
        // писать), поэтому здесь обычный div, а не ссылка.
        <div className="flex min-w-0 flex-1 cursor-default items-center gap-3">{chatBody}</div>
      ) : (
        <Link href={`/chats/${chat.conversationId}`} className="flex min-w-0 flex-1 items-center gap-3">
          {chatBody}
        </Link>
      )}

      <button
        onClick={() => onToggleFavorite(chat.conversationId, !chat.isFavorite)}
        aria-label={chat.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
        className="shrink-0 p-1"
      >
        <StarIcon filled={chat.isFavorite} />
      </button>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "#FFB800" : "none"}>
      <path
        d="M12 2.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.7L12 2.5z"
        stroke={filled ? "#FFB800" : "#B8B8C8"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
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
FILE2_EOF
