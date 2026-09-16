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

  // Один общий чат на всю встречу — не отдельный чат на каждого принятого
  // человека. Ищем уже существующий (создан при первом принятии на эту
  // встречу) и просто добавляем туда нового участника; если это первое
  // принятие — создаём чат и добавляем организатора.
  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id")
    .eq("event_id", application.event_id)
    .maybeSingle();

  let conversationId = existingConversation?.id;

  if (!conversationId) {
    const { data: newConversation } = await admin
      .from("conversations")
      .insert({ event_id: application.event_id })
      .select("id")
      .single();
    conversationId = newConversation?.id;
    if (conversationId) {
      await admin.from("conversation_members").insert({ conversation_id: conversationId, user_id: organizerId });
    }
  }

  if (conversationId) {
    await admin.from("conversation_members").insert({ conversation_id: conversationId, user_id: application.user_id });
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
    admin.from("conversations").select("event_id, events(title)").eq("id", conversationId).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const members = (otherMemberRows ?? [])
    .map((row) => {
      const user = row.user as unknown as { id: string; name: string; avatar_url: string | null } | null;
      if (!user) return null;
      return { id: user.id, name: user.name, avatarUrl: user.avatar_url, lastReadAt: row.last_read_at as string | null };
    })
    .filter((m): m is { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null } => !!m);

  const eventTitle = (conversationRow?.events as unknown as { title: string } | null)?.title ?? null;

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
    eventTitle,
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
  // Все ОСТАЛЬНЫЕ участники чата (не считая себя) — на встречу с 3-4
  // принятыми людьми это будет несколько человек, не один собеседник.
  const [members, setMembers] = useState<Member[]>([]);
  const [showMiniProfileFor, setShowMiniProfileFor] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
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
        setEventTitle(history.eventTitle ?? null);
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
    if (!content || sending || !myUserId) return;

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
  const headerTitle = eventTitle ?? (members.length === 1 ? members[0].name : "Чат");
  const soleMember = members.length === 1 ? members[0] : null;

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
          {isGroup && <span className="shrink-0 text-xs text-ink-400">{members.length + 1} чел.</span>}
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
      events: {
        title: string;
        status: string;
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
      category: conversation?.events?.category ?? null,
      // otherUser — для отображения аватара в списке: если участник один
      // (как раньше), показываем его фото; если несколько — компонент сам
      // решает показать иконку группы (см. otherMembersCount).
      otherUser: otherMembersList[0] ?? null,
      otherMembersCount: otherMembersList.length,
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
  const name = chat.otherUser?.name ?? "Пользователь";
  // Заголовок карточки — название встречи (по референсу это важнее, чем
  // "с кем", ты сначала вспоминаешь ПРО ЧТО был чат) — теперь так вообще
  // всегда, раз чат один на всю встречу, а не на человека.
  const title = chat.eventTitle ?? name;
  const isUnread = chat.unreadCount > 0;

  const previewText = chat.lastMessage
    ? `${chat.lastMessage.isMine ? "Вы" : name.split(" ")[0]}: ${chat.lastMessage.content}`
    : "Чат создан";

  return (
    <div className="flex items-center gap-2 rounded-card bg-white p-3 shadow-card">
      <Link href={`/chats/${chat.conversationId}`} className="flex min-w-0 flex-1 items-center gap-3">
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

mkdir -p "app/api/events/[id]/members/[userId]"
cat > "app/api/events/[id]/members/[userId]/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";

/**
 * DELETE /api/events/[id]/members/[userId]
 *
 * Организатор убирает уже принятого участника ДО начала встречи (не после —
 * иначе можно было бы «уводить» людей с уже прошедших встреч задним числом,
 * искажая счётчик посещённых встреч и рейтинг). Освобождает место —
 * release_event_seat сам решает, возвращать ли встречу в 'published', если
 * она была закрыта именно из-за заполненности (см. миграцию 0023).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id: eventId, userId: memberUserId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, title, event_date, event_time, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (memberUserId === currentUser.userId) {
    return NextResponse.json({ error: "cannot_remove_organizer" }, { status: 422 });
  }

  const eventStartsAt = new Date(`${event.event_date}T${event.event_time}`);
  if (eventStartsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "event_already_started" }, { status: 422 });
  }

  const { data: application } = await admin
    .from("applications")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", memberUserId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!application) return NextResponse.json({ error: "not_a_member" }, { status: 404 });

  await admin.from("applications").update({ status: "removed" }).eq("id", application.id);
  await admin.from("event_members").delete().eq("event_id", eventId).eq("user_id", memberUserId);
  await admin.rpc("release_event_seat", { p_event_id: eventId });

  // Убираем и из общего группового чата встречи — иначе человек остаётся в
  // переписке, хотя из самой встречи его уже исключили.
  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (conversation) {
    await admin
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", memberUserId);
  }

  const { data: removedUser } = await admin
    .from("users")
    .select("telegram_id")
    .eq("id", memberUserId)
    .maybeSingle();
  if (removedUser) {
    notifyTelegram(removedUser.telegram_id, `Организатор убрал тебя из встречи «${event.title}».`).catch(() => {});
  }

  return NextResponse.json({ status: "removed" });
}
ENDOFFILE

