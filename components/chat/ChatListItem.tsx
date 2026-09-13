"use client";

import Link from "next/link";

export interface ChatListItemData {
  conversationId: string;
  unreadCount: number;
  isBlocked: boolean;
  eventTitle: string | null;
  otherUser: { id: string; name: string; avatar_url: string | null } | null;
  lastMessage: { content: string; createdAt: string } | null;
}

export function ChatListItem({ chat }: { chat: ChatListItemData }) {
  const name = chat.otherUser?.name ?? "Пользователь";

  return (
    <Link
      href={`/chats/${chat.conversationId}`}
      className="flex items-center gap-3 rounded-card bg-white p-3 shadow-card"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background text-base font-semibold text-ink-600">
        {chat.otherUser?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chat.otherUser.avatar_url} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-ink-900">{name}</span>
          {chat.lastMessage && (
            <span className="shrink-0 text-xs text-ink-400">{formatTime(chat.lastMessage.createdAt)}</span>
          )}
        </div>
        {chat.eventTitle && <p className="truncate text-xs text-ink-400">{chat.eventTitle}</p>}
        <p className="truncate text-sm text-ink-600">{chat.lastMessage?.content ?? "Чат создан"}</p>
      </div>

      {chat.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-white">
          {chat.unreadCount}
        </span>
      )}
    </Link>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
