mkdir -p "components/chat"
cat > "components/chat/ChatListItem.tsx" << 'ENDOFFILE'
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
 * История сообщений (последние 50, по возрастанию времени) + название
 * встречи и список ОСТАЛЬНЫХ участников (для шапки группового чата и
 * подписи над входящими сообщениями — теперь участников может быть
 * несколько, не только один собеседник, как раньше).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  if (eventCheckStatus === "completed" || eventCheckStatus === "cancelled") {
    return NextResponse.json({ error: "event_closed" }, { status: 403 });
  }

  const [{ data: messages, error }, { data: otherMemberRows }, { data: conversationRow }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT),
    // Все ОСТАЛЬНЫЕ участники (не только один, как раньше) — имя и фото
    // для подписи над сообщениями, last_read_at каждого для галочек
    // "прочитано" (сообщение считается прочитанным только когда ВСЕ
    // остальные участники его увидели — логично для группового чата).
    admin
      .from("conversation_members")
      .select("last_read_at, user:users(id, name, avatar_url)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId),
    admin.from("conversations").select("event_id, events(title, status)").eq("id", conversationId).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const members = (otherMemberRows ?? [])
    .map((row) => {
      const user = row.user as unknown as { id: string; name: string; avatar_url: string | null } | null;
      if (!user) return null;
      return { id: user.id, name: user.name, avatarUrl: user.avatar_url, lastReadAt: row.last_read_at as string | null };
    })
    .filter((m): m is { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null } => !!m);

  const eventInfo = conversationRow?.events as unknown as { title: string; status: string } | null;

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
    eventTitle: eventInfo?.title ?? null,
    eventStatus: eventInfo?.status ?? null,
    members,
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

mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";
import { useTelegramViewportHeight } from "@/lib/telegram/webapp-client";
import { useVisualViewportHeight } from "@/lib/hooks/use-visual-viewport-height";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";

interface ChatPageProps {
  // Next.js 14 (в этом проекте) передаёт params клиентским компонентам
  // как обычный объект, НЕ как Promise — это фича Next.js 15. Использование
  // React.use(params) здесь было реальным багом: он падает с
  // "client-side exception" при самом первом открытии страницы, потому что
  // use() поддерживает только Promise/Context, а не произвольный объект.
  params: { id: string };
}

interface Member {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string | null;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();
  useLockBodyScroll();

  const visualViewportHeight = useVisualViewportHeight();
  const telegramViewportHeight = useTelegramViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  // Все ОСТАЛЬНЫЕ участники чата (не считая себя) — на встречу с 3-4
  // принятыми людьми это будет несколько человек, не один собеседник.
  const [members, setMembers] = useState<Member[]>([]);
  const [showMiniProfileFor, setShowMiniProfileFor] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const [meRes, tokenRes, historyRes] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/auth/realtime-token"),
          fetch(`/api/conversations/${conversationId}/messages`),
        ]);

        if (!meRes.ok || !tokenRes.ok || !historyRes.ok) {
          if (historyRes.status === 403) {
            const data = await historyRes.json().catch(() => ({}));
            if (data.error === "event_closed" && !cancelled) {
              setAccessBlocked(true);
              return;
            }
          }
          if (!cancelled) setError("Не удалось открыть чат.");
          return;
        }

        const [me, tokenData, history] = await Promise.all([
          meRes.json(),
          tokenRes.json(),
          historyRes.json(),
        ]);

        if (cancelled) return;

        setMyUserId(me.userId);
        setMessages(history.messages ?? []);
        setEventTitle(history.eventTitle ?? null);
        setEventStatus(history.eventStatus ?? null);
        setMembers(history.members ?? []);

        const client = createBrowserRealtimeClient(tokenData.token);
        clientRef.current = client;

        const channel = client
          .channel(`conversation:${conversationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const row = payload.new as {
                id: string;
                sender_id: string;
                content: string;
                created_at: string;
              };
              setMessages((prev) =>
                prev.some((m) => m.id === row.id)
                  ? prev
                  : [...prev, { id: row.id, senderId: row.sender_id, content: row.content, createdAt: row.created_at }]
              );
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "conversation_members",
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const row = payload.new as { user_id: string; last_read_at: string | null };
              if (row.user_id === me.userId) return;
              setMembers((prev) =>
                prev.map((m) => (m.id === row.user_id ? { ...m, lastReadAt: row.last_read_at } : m))
              );
            }
          )
          .subscribe();

        channelRef.current = channel;

        fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read" }),
        }).catch(() => {});
      } catch {
        if (!cancelled) setError("Проблема с соединением.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (channelRef.current) clientRef.current?.removeChannel(channelRef.current);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, liveHeight]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending || !myUserId || isEventClosed) return;

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, senderId: myUserId, content, createdAt: new Date().toISOString() }]);
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("Не получилось отправить сообщение.");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(content);
        return;
      }
      if (data.messageId && data.createdAt) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: data.messageId, createdAt: data.createdAt } : m))
        );
      }
    } catch {
      setError("Проблема с соединением.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  const isGroup = members.length > 1;
  const isEventClosed = eventStatus === "completed" || eventStatus === "cancelled";
  const headerTitle = eventTitle ?? (members.length === 1 ? (members[0]?.name ?? "Чат") : "Чат");
  const soleMember = members.length === 1 ? members[0] : null;

  if (accessBlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <p className="text-lg font-medium text-ink-900">Чат недоступен</p>
        <p className="text-sm text-ink-600">Событие уже прошло или было отменено.</p>
        <button
          onClick={() => router.push("/chats")}
          className="mt-2 rounded-pill bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-cta"
        >
          Назад к чатам
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden bg-background"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <div className={`flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3 ${isEventClosed ? "opacity-60" : ""}`}>
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <button
          onClick={() => (soleMember ? setShowMiniProfileFor(soleMember.id) : setShowParticipants(true))}
          className="flex min-w-0 flex-1 items-center gap-3"
          disabled={members.length === 0}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-xs font-semibold text-ink-600">
            {soleMember ? (
              soleMember.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={soleMember.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                soleMember.name.charAt(0).toUpperCase()
              )
            ) : (
              <span className="text-sm">👥</span>
            )}
          </div>
          <span className="truncate font-medium">{headerTitle}</span>
          {isEventClosed ? (
            <span className="shrink-0 text-xs text-ink-400">Событие закрыто</span>
          ) : (
            isGroup && <span className="shrink-0 text-xs text-ink-400">{members.length + 1} чел.</span>
          )}
        </button>
      </div>

      {showMiniProfileFor && (
        <MiniProfileSheet userId={showMiniProfileFor} onClose={() => setShowMiniProfileFor(null)} />
      )}

      {showParticipants && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setShowParticipants(false)}>
          <div className="rounded-t-sheet bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Участники ({members.length + 1})</h2>
            <div className="space-y-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setShowParticipants(false);
                    setShowMiniProfileFor(m.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-card p-2 text-left hover:bg-lavender-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      m.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="font-medium text-ink-900">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDaySeparator = !prev || !isSameDay(prev.createdAt, message.createdAt);
          const isOwn = message.senderId === myUserId;
          const isRead =
            members.length > 0 && members.every((m) => m.lastReadAt && message.createdAt <= m.lastReadAt);
          const sender = members.find((m) => m.id === message.senderId);
          const showSenderLabel = !isOwn && (!prev || prev.senderId !== message.senderId || showDaySeparator);

          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-pill bg-lavender-100 px-3 py-1 text-[11px] font-medium text-ink-600">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {showSenderLabel && (
                <p className="mb-1 ml-1 text-xs font-medium text-ink-600">{sender?.name ?? "Участник"}</p>
              )}
              <MessageBubble message={message} isOwn={isOwn} readStatus={isRead ? "read" : "sent"} />
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-lavender-100 bg-white p-3">
        {isEventClosed ? (
          <p className="w-full text-center text-sm text-ink-400">
            Событие закрыто — отправка новых сообщений недоступна.
          </p>
        ) : (
          <>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Написать сообщение..."
              className="min-w-0 flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient disabled:opacity-40"
              aria-label="Отправить"
            >
              <Image
                src="/brand/icons/send.svg"
                alt=""
                width={18}
                height={18}
                style={{ filter: "brightness(0) invert(1)" }}
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
ENDOFFILE

