mkdir -p "app/api/conversations/[id]/messages"
cat > "app/api/conversations/[id]/messages/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * История сообщений (последние 50, по возрастанию времени).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const membership = await assertMembership(admin, conversationId, currentUser.userId);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [{ data: messages, error }, { data: otherMember }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_HISTORY_LIMIT),
    // last_read_at собеседника — используется на фронте для галочек
    // "доставлено" / "прочитано" (упрощённо: сообщение считается
    // прочитанным, если оно старше last_read_at собеседника).
    admin
      .from("conversation_members")
      .select("last_read_at")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({
    messages: (messages ?? []).reverse(),
    otherMemberLastReadAt: otherMember?.last_read_at ?? null,
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
    .select("user_id")
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
  }

  return NextResponse.json({ status: "sent", messageId: message.id, createdAt: message.created_at });
}
ENDOFFILE

mkdir -p "components/chat"
cat > "components/chat/MessageBubble.tsx" << 'ENDOFFILE'
import clsx from "clsx";

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

// Одна галочка — отправлено/доставлено, две (подсвеченные) — собеседник прочитал.
function ReadTicks({ status }: { status: "sent" | "read" }) {
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

mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";

interface ChatPageProps {
  // Next.js 14 (в этом проекте) передаёт params клиентским компонентам
  // как обычный объект, НЕ как Promise — это фича Next.js 15. Использование
  // React.use(params) здесь было реальным багом: он падает с
  // "client-side exception" при самом первом открытии страницы, потому что
  // use() поддерживает только Promise/Context, а не произвольный объект.
  params: { id: string };
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = params;
  const router = useRouter();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
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
  }, [messages.length]);

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
      if (!res.ok) {
        setError("Не получилось отправить сообщение.");
        setDraft(content);
      }
    } catch {
      setError("Проблема с соединением.");
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3">
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <span className="font-medium">Чат</span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDaySeparator = !prev || !isSameDay(prev.createdAt, message.createdAt);
          const isOwn = message.senderId === myUserId;
          const isRead = Boolean(otherLastReadAt && message.createdAt <= otherLastReadAt);

          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-pill bg-lavender-100 px-3 py-1 text-[11px] font-medium text-ink-600">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
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
          className="min-w-0 flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
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

mkdir -p "components/layout"
cat > "components/layout/BottomNav.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Финальная навигация МЕСТО: по центру — переход к полному списку встреч
// с фильтрами (раньше здесь были монеты подписки; монеты переехали в
// профиль — см. app/(app)/profile/page.tsx, карточка "Мой пакет").
const TABS = [
  { href: "/feed", label: "Главная", icon: "nav-home" },
  { href: "/map", label: "Карта", icon: "nav-map" },
  { href: "/chats", label: "Чаты", icon: "nav-chat" },
  { href: "/profile", label: "Профиль", icon: "nav-profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => {
        const total = (data.items ?? []).reduce(
          (sum: number, item: { unreadCount: number }) => sum + (item.unreadCount || 0),
          0
        );
        setUnreadChats(total);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-sheet border-t border-lavender-100 bg-white/95 shadow-card-lg backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {left.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}

        <Link
          href="/search"
          aria-label="Поиск встреч"
          className="-mt-5 flex flex-col items-center gap-1 active:scale-95"
        >
          <div
            className={clsx(
              "flex h-12 w-12 items-center justify-center rounded-full shadow-cta",
              pathname === "/search" ? "bg-brand-gradient" : "bg-ink-900"
            )}
          >
            <Image
              src="/brand/icons/location.svg"
              alt=""
              width={22}
              height={22}
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <span className={clsx("text-xs", pathname === "/search" ? "text-accent font-medium" : "text-ink-400")}>
            Встречи
          </span>
        </Link>

        {right.map((tab) => (
          <NavTab
            key={tab.href}
            tab={tab}
            active={pathname === tab.href}
            badge={tab.href === "/chats" ? unreadChats : 0}
          />
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  tab,
  active,
  badge = 0,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  badge?: number;
}) {
  const src = `/brand/navigation/${tab.icon}-${active ? "active" : "default"}.svg`;
  return (
    <Link
      href={tab.href}
      className={clsx(
        "relative flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs",
        active ? "text-accent font-medium" : "text-ink-400"
      )}
    >
      <span className="relative">
        <Image src={src} alt="" width={24} height={24} />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {tab.label}
    </Link>
  );
}
ENDOFFILE

