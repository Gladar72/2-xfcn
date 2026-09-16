mkdir -p "app/api/users/[id]"
cat > "app/api/users/[id]/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/users/:id
 *
 * Краткий публичный профиль другого пользователя — для попапа при тапе на
 * аватар собеседника в чате (фото, возраст, пол, рейтинг, интересы, о себе).
 * Требует авторизации, но не проверяет наличие общего чата/встречи —
 * те же данные и так открыты всем в карточках встреч (организатор).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: user }, { data: interestRows }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, avatar_url, birth_date, gender, bio, rating_avg, completed_meetings_count")
      .eq("id", id)
      .maybeSingle(),
    admin.from("user_interests").select("interests(name)").eq("user_id", id),
  ]);

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const interests = (interestRows ?? [])
    .map((r) => (r.interests as unknown as { name: string } | null)?.name)
    .filter((n): n is string => !!n);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    age: calculateAge(user.birth_date),
    gender: user.gender,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    completedMeetingsCount: user.completed_meetings_count,
    interests,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}
ENDOFFILE

mkdir -p "components/chat"
cat > "components/chat/MiniProfileSheet.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";

interface MiniProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  age: number;
  gender: "male" | "female" | null;
  bio: string | null;
  ratingAvg: number;
  completedMeetingsCount: number;
  interests: string[];
}

export function MiniProfileSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.error) setProfile(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="rounded-t-sheet bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />

        {loading && <p className="py-8 text-center text-ink-600">Загрузка...</p>}

        {!loading && !profile && <p className="py-8 text-center text-ink-600">Не удалось загрузить профиль.</p>}

        {profile && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 h-24 w-24 overflow-hidden rounded-full bg-lavender-100 text-3xl font-semibold text-ink-600">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <h2 className="text-title">
              {profile.name}, {profile.age}
            </h2>

            <div className="mt-1 flex items-center gap-3 text-sm text-ink-600">
              <span>⭐ {profile.ratingAvg.toFixed(1)}</span>
              <span>·</span>
              <span>{profile.completedMeetingsCount} встреч</span>
              {profile.gender && <span>· {profile.gender === "male" ? "Мужчина" : "Женщина"}</span>}
            </div>

            {profile.bio && <p className="mt-3 text-sm text-ink-900">{profile.bio}</p>}

            {profile.interests.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {profile.interests.map((interest) => (
                  <span key={interest} className="rounded-pill bg-lavender-100 px-3 py-1 text-xs text-ink-600">
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
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

interface OtherUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();
  useLockBodyScroll();

  // visualViewport — основной источник (надёжнее в разных клиентах
  // Telegram), Telegram.WebApp.viewportHeight — запасной вариант.
  const visualViewportHeight = useVisualViewportHeight();
  const telegramViewportHeight = useTelegramViewportHeight();
  const liveHeight = visualViewportHeight ?? telegramViewportHeight;

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [showMiniProfile, setShowMiniProfile] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setOtherLastReadAt(history.otherMemberLastReadAt ?? null);
        setOtherUser(history.otherUser ?? null);

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
              // Интересует только собеседник — свою же запись о прочтении
              // мы обновляем сами при открытии чата.
              if (row.user_id !== me.userId) setOtherLastReadAt(row.last_read_at);
            }
          )
          .subscribe();

        channelRef.current = channel;

        // Отмечаем прочитанным при открытии чата
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
    // Пересчитываем при появлении клавиатуры (liveHeight меняется) —
    // иначе последнее сообщение может оказаться под ней.
  }, [messages.length, liveHeight]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;

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
        setDraft(content);
        return;
      }
      // Добавляем сообщение в чат сразу же, не дожидаясь Realtime — раньше
      // приходилось выходить из чата и заходить снова, чтобы увидеть своё
      // же отправленное сообщение. Если Realtime всё-таки пришлёт то же
      // сообщение (обычный сценарий), проверка на id в обработчике INSERT
      // не даст добавить дубликат.
      if (myUserId && data.messageId && data.createdAt) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.messageId)
            ? prev
            : [...prev, { id: data.messageId, senderId: myUserId, content, createdAt: data.createdAt }]
        );
      }
    } catch {
      setError("Проблема с соединением.");
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden bg-background"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3">
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <button
          onClick={() => otherUser && setShowMiniProfile(true)}
          className="flex items-center gap-3"
          disabled={!otherUser}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-xs font-semibold text-ink-600">
            {otherUser?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherUser.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              otherUser?.name?.charAt(0).toUpperCase() ?? "?"
            )}
          </div>
          <span className="font-medium">{otherUser?.name ?? "Чат"}</span>
        </button>
      </div>

      {showMiniProfile && otherUser && (
        <MiniProfileSheet userId={otherUser.id} onClose={() => setShowMiniProfile(false)} />
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDaySeparator = !prev || !isSameDay(prev.createdAt, message.createdAt);
          const isOwn = message.senderId === myUserId;
          const isRead = Boolean(otherLastReadAt && message.createdAt <= otherLastReadAt);
          // Подпись с именем над входящим сообщением показываем только у
          // первого сообщения в подряд идущей группе от одного автора —
          // не над каждым, чтобы не загромождать чат.
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
                <p className="mb-1 ml-1 text-xs font-medium text-ink-600">{otherUser?.name ?? "Собеседник"}</p>
              )}
              <MessageBubble message={message} isOwn={isOwn} readStatus={isRead ? "read" : "sent"} />
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-lavender-100 bg-white p-3">
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

mkdir -p "app/api/conversations/[id]"
cat > "app/api/conversations/[id]/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type Action = "mark_read" | "hide" | "unhide" | "block" | "unblock" | "favorite" | "unfavorite";

/**
 * PATCH /api/conversations/[id]
 * Body: { action: "mark_read" | "hide" | "unhide" | "block" | "unblock" }
 *
 * "Удаление" чата из ТЗ (п.15) реализовано как скрытие только для текущего
 * пользователя (is_hidden на его собственной строке conversation_members) —
 * собеседник продолжает видеть переписку у себя.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as Action | undefined;
  if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 });

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("conversation_members")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUser.userId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  switch (action) {
    case "mark_read":
      updates.unread_count = 0;
      updates.last_read_at = new Date().toISOString();
      break;
    case "hide":
      updates.is_hidden = true;
      break;
    case "unhide":
      updates.is_hidden = false;
      break;
    case "block":
      updates.is_blocked = true;
      break;
    case "unblock":
      updates.is_blocked = false;
      break;
    case "favorite":
      updates.is_favorite = true;
      break;
    case "unfavorite":
      updates.is_favorite = false;
      break;
    default:
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  await admin.from("conversation_members").update(updates).eq("id", membership.id);

  return NextResponse.json({ status: "ok" });
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
      conversation_id, unread_count, is_hidden, is_blocked, is_favorite,
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
      isFavorite: m.is_favorite,
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
  otherUser: { id: string; name: string; avatar_url: string | null } | null;
  lastMessage: { content: string; createdAt: string; isMine: boolean } | null;
  /** Прочитал ли собеседник наше последнее сообщение (только когда lastMessage.isMine). */
  isLastMessageRead?: boolean;
}

export function ChatListItem({
  chat,
  onToggleFavorite,
}: {
  chat: ChatListItemData;
  onToggleFavorite: (conversationId: string, next: boolean) => void;
}) {
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
    <div className="flex items-center gap-2 rounded-card bg-white p-3 shadow-card">
      <Link href={`/chats/${chat.conversationId}`} className="flex min-w-0 flex-1 items-center gap-3">
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

mkdir -p "app/(app)/chats"
cat > "app/(app)/chats/page.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChatListItem, type ChatListItemData } from "@/components/chat/ChatListItem";

type Tab = "all" | "events" | "people" | "favorites";

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatListItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setChats(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  function handleToggleFavorite(conversationId: string, next: boolean) {
    // Обновляем сразу в интерфейсе, не дожидаясь ответа сервера — звёздочка
    // должна заполняться мгновенно по тапу.
    setChats((prev) => prev.map((c) => (c.conversationId === conversationId ? { ...c, isFavorite: next } : c)));
    fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "favorite" : "unfavorite" }),
    }).catch(() => {
      // Откатываем при ошибке сети.
      setChats((prev) => prev.map((c) => (c.conversationId === conversationId ? { ...c, isFavorite: !next } : c)));
    });
  }

  const filtered = useMemo(() => {
    if (tab === "favorites") {
      return chats.filter((c) => c.isFavorite);
    }
    if (tab === "events") {
      // Только активные (ещё не прошедшие/не отменённые) встречи.
      return chats.filter((c) => c.eventStatus === "published");
    }
    if (tab === "people") {
      // Один чат на человека — если с кем-то несколько встреч/чатов,
      // берём самый свежий (список уже отсортирован по свежести на бэкенде).
      const seen = new Set<string>();
      return chats.filter((c) => {
        const key = c.otherUser?.id ?? c.conversationId;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return chats;
  }, [chats, tab]);

  return (
    <div className="px-5 py-6">
      <h1 className="text-display mb-4">Чаты</h1>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(
          [
            ["all", "Все"],
            ["favorites", "★ Избранное"],
            ["events", "Встречи"],
            ["people", "Люди"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`shrink-0 rounded-pill px-4 py-1.5 text-sm font-medium ${
              tab === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-600 shadow-card"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="relative mb-4 h-32 w-32">
            <Image src="/brand/3d/empty-chats.png" alt="" fill className="object-contain" sizes="128px" />
          </div>
          <p className="text-sm text-ink-600">
            {tab === "favorites"
              ? "Пока нет избранных чатов — нажми на звёздочку рядом с чатом, чтобы не потерять его."
              : tab === "events"
                ? "Нет чатов по активным встречам."
                : "Когда вас пригласят на встречу, чат появится здесь."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((chat) => (
          <ChatListItem key={chat.conversationId} chat={chat} onToggleFavorite={handleToggleFavorite} />
        ))}
      </div>
    </div>
  );
}
ENDOFFILE

