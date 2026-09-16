"use client";

import Link from "next/link";
import { ReadTicks } from "./ReadTicks";

export interface ChatListItemData {
  conversationId: string;
  unreadCount: number;
  isBlocked: boolean;
  isFavorite: boolean;
  eventTitle: string | null;
  eventStatus: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
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
  const isGroup = chat.otherMembersCount > 1;
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
        {isGroup ? (
          <span className="text-lg">👥</span>
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
