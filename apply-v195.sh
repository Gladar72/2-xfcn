mkdir -p "app/api/conversations/[id]/messages"
cat > "app/api/conversations/[id]/messages/route.ts" << 'FILE1_EOF'
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
    // Все ОСТАЛЬНЫЕ участники (не только один, как раньше) — имя, фото,
    // возраст, пол и число посещённых встреч для списка "Участники
    // события", last_read_at каждого для галочек "прочитано" (сообщение
    // считается прочитанным только когда ВСЕ остальные участники его
    // увидели — логично для группового чата).
    admin
      .from("conversation_members")
      .select("last_read_at, user:users(id, name, avatar_url, birth_date, gender, completed_meetings_count)")
      .eq("conversation_id", conversationId)
      .neq("user_id", currentUser.userId),
    admin
      .from("conversations")
      .select("event_id, events(title, status, is_business, organizer_id, photo_url, category:categories(slug, name, emoji))")
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
  }

  const members = (otherMemberRows ?? [])
    .map((row) => {
      const user = row.user as unknown as RawMemberUser | null;
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatar_url,
        age: calcAge(user.birth_date),
        gender: user.gender,
        completedMeetingsCount: user.completed_meetings_count ?? 0,
        lastReadAt: row.last_read_at as string | null,
      };
    })
    .filter((m): m is NonNullable<typeof m> => !!m);

  const eventInfo = conversationRow?.events as unknown as {
    title: string;
    status: string;
    is_business: boolean;
    organizer_id: string | null;
    photo_url: string | null;
    category: { slug: string; name: string; emoji: string | null } | null;
  } | null;

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
    category: eventInfo?.category ?? null,
    isBusiness: eventInfo?.is_business ?? false,
    organizerId: eventInfo?.organizer_id ?? null,
    eventPhotoUrl: eventInfo?.photo_url ?? null,
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
FILE1_EOF
mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'FILE2_EOF'
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, formatDayLabel, type MessageData } from "@/components/chat/MessageBubble";
import { MiniProfileSheet } from "@/components/chat/MiniProfileSheet";
import { CATEGORY_ICON } from "@/lib/data/category-icons";
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
  age: number | null;
  gender: string | null;
  completedMeetingsCount: number;
  lastReadAt: string | null;
}

type ParticipantsTab = "all" | "organizer" | "participants";

const PARTICIPANTS_PAGE_SIZE = 7;

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
  const [category, setCategory] = useState<{ slug: string; name: string; emoji: string | null } | null>(null);
  const [isBusiness, setIsBusiness] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [eventPhotoUrl, setEventPhotoUrl] = useState<string | null>(null);
  // Все ОСТАЛЬНЫЕ участники чата (не считая себя) — на встречу с 3-4
  // принятыми людьми это будет несколько человек, не один собеседник.
  const [members, setMembers] = useState<Member[]>([]);
  const [showMiniProfileFor, setShowMiniProfileFor] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participantsTab, setParticipantsTab] = useState<ParticipantsTab>("all");
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
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
        setCategory(history.category ?? null);
        setIsBusiness(history.isBusiness ?? false);
        setOrganizerId(history.organizerId ?? null);
        setEventPhotoUrl(history.eventPhotoUrl ?? null);
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

  function openParticipants() {
    setParticipantsTab("all");
    setParticipantsExpanded(false);
    setShowParticipants(true);
  }

  const isGroup = members.length > 1;
  const isEventClosed = eventStatus === "completed" || eventStatus === "cancelled";
  const headerTitle = eventTitle ?? (members.length === 1 ? (members[0]?.name ?? "Чат") : "Чат");
  const soleMember = members.length === 1 ? members[0] : null;
  const categoryIcon = isBusiness ? "/brand/markers/marker-business.png" : category ? CATEGORY_ICON[category.slug] : undefined;
  const totalParticipantsCount = members.length + 1; // +1 — сам зашедший пользователь

  const visibleParticipants =
    participantsTab === "organizer"
      ? members.filter((m) => m.id === organizerId)
      : participantsTab === "participants"
        ? members.filter((m) => m.id !== organizerId)
        : members;
  const participantsToShow = participantsExpanded
    ? visibleParticipants
    : visibleParticipants.slice(0, PARTICIPANTS_PAGE_SIZE);
  const hiddenParticipantsCount = visibleParticipants.length - participantsToShow.length;

  if (accessBlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
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
      className="fixed inset-x-0 top-0 z-40 flex flex-col overflow-hidden"
      style={{ height: liveHeight ? `${liveHeight}px` : "100dvh" }}
    >
      <div className={`flex shrink-0 items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3 ${isEventClosed ? "opacity-60" : ""}`}>
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <button
          onClick={() => (soleMember ? setShowMiniProfileFor(soleMember.id) : openParticipants())}
          className="flex min-w-0 flex-1 items-center gap-3"
          disabled={members.length === 0}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-xs font-semibold text-ink-600">
            {eventPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={eventPhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : categoryIcon ? (
              <Image src={categoryIcon} alt="" width={20} height={20} className="object-contain" />
            ) : category?.emoji ? (
              <span className="text-sm">{category.emoji}</span>
            ) : soleMember ? (
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
          {isEventClosed && <span className="shrink-0 text-xs text-ink-400">Событие закрыто</span>}
        </button>
      </div>

      {/* Закреплённая плашка с аватарками участников — по референсу
          пользователя. Только для группового чата встречи (не для
          обычного диалога один на один) и пока событие не закрыто. */}
      {isGroup && !isEventClosed && (
        <button
          onClick={openParticipants}
          className="mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-card bg-white p-3 text-left shadow-card"
        >
          <div className="flex shrink-0 -space-x-2">
            {members.slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
              >
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  m.name.charAt(0).toUpperCase()
                )}
              </div>
            ))}
            {totalParticipantsCount > 4 && (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-accent">
                +{totalParticipantsCount - 3}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-900">Уже идут {totalParticipantsCount} человек</p>
            <p className="text-xs text-ink-600">Нажми, чтобы посмотреть участников</p>
          </div>
          <span className="shrink-0 text-ink-400">›</span>
        </button>
      )}

      {showMiniProfileFor && (
        <MiniProfileSheet userId={showMiniProfileFor} onClose={() => setShowMiniProfileFor(null)} />
      )}

      {showParticipants && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setShowParticipants(false)}>
          <div
            className="max-h-[80vh] overflow-y-auto rounded-t-sheet bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-1 text-center">Участники события</h2>
            <p className="mb-4 text-center text-sm text-ink-600">{totalParticipantsCount} человек</p>

            <div className="mb-4 flex justify-center gap-2">
              {(
                [
                  ["all", "Все"],
                  ["organizer", "Организатор"],
                  ["participants", "Участники"],
                ] as [ParticipantsTab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setParticipantsTab(value);
                    setParticipantsExpanded(false);
                  }}
                  className={`rounded-pill px-4 py-1.5 text-sm font-medium ${
                    participantsTab === value ? "bg-brand-gradient text-white" : "bg-lavender-100 text-ink-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              {participantsToShow.map((m) => {
                const isOrganizer = m.id === organizerId;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setShowParticipants(false);
                      setShowMiniProfileFor(m.id);
                    }}
                    className="flex w-full items-center gap-3 rounded-card p-2 text-left hover:bg-lavender-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lavender-100 text-sm font-semibold text-ink-600">
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        m.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">
                        {m.name}
                        {m.age ? `, ${m.age}` : ""}
                      </p>
                      <p className="text-xs text-ink-600">
                        {isOrganizer ? "Организатор" : "Участник"}
                        {m.completedMeetingsCount > 0 &&
                          ` • ${isFemale(m.gender) ? "была" : "был"} на ${m.completedMeetingsCount} ${pluralizeMeetings(m.completedMeetingsCount)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-ink-400">›</span>
                  </button>
                );
              })}
            </div>

            {hiddenParticipantsCount > 0 && (
              <button
                onClick={() => setParticipantsExpanded(true)}
                className="mt-2 w-full py-2 text-center text-sm font-medium text-accent"
              >
                Показать ещё {hiddenParticipantsCount} {pluralizeParticipants(hiddenParticipantsCount)} ⌄
              </button>
            )}
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

// Значение поля пола в базе не проверено мной напрямую (нет доступа к
// миграциям прямо сейчас) — подстраховываюсь несколькими часто
// встречающимися вариантами написания. Если "был/была" перепутается —
// пришли точное значение из БД (select distinct gender from users), поправлю.
function isFemale(gender: string | null): boolean {
  if (!gender) return false;
  return ["female", "f", "ж", "woman"].includes(gender.toLowerCase());
}

function pluralizeMeetings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "встрече";
  return "встречах";
}

function pluralizeParticipants(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "участника";
  if ([2, 3, 4].includes(mod10) && !(mod100 >= 12 && mod100 <= 14)) return "участников";
  return "участников";
}
FILE2_EOF
