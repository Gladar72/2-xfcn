mkdir -p "components/layout"
cat > "components/layout/BottomNav.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Финальная навигация МЕСТО (см. бриф п.16-19): центральный "+" убран,
// вместо него — фирменные 3D-монеты, ведущие на экран тарифов/подписки.
// Создание встречи теперь отдельная CTA на главном экране (п.27), а не
// кнопка в навигации. Иконки — SVG с отдельными default/active файлами
// (currentColor не работает при подключении через <img>/next/image).
const TABS = [
  { href: "/feed", label: "Главная", icon: "nav-home" },
  { href: "/map", label: "Карта", icon: "nav-map" },
  { href: "/chats", label: "Чаты", icon: "nav-chat" },
  { href: "/profile", label: "Профиль", icon: "nav-profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-sheet border-t border-lavender-100 bg-white/95 shadow-card-lg backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {left.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}

        <Link
          href="/subscriptions"
          aria-label="Тарифы и подписка"
          className="-mt-7 flex flex-col items-center active:scale-95"
        >
          <div className="relative h-14 w-16 drop-shadow-[0_8px_16px_rgba(255,138,42,0.35)]">
            <Image src="/brand/3d/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
          </div>
        </Link>

        {right.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const src = `/brand/navigation/${tab.icon}-${active ? "active" : "default"}.svg`;
  return (
    <Link
      href={tab.href}
      className={clsx(
        "flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs",
        active ? "text-accent font-medium" : "text-ink-400"
      )}
    >
      <Image src={src} alt="" width={24} height={24} />
      {tab.label}
    </Link>
  );
}
ENDOFFILE

mkdir -p "components/layout"
cat > "components/layout/TopBar.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import Link from "next/link";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  hasUnreadNotifications?: boolean;
  onCityPress?: () => void;
  onNotificationsPress?: () => void;
}

export function TopBar({
  city,
  avatarUrl,
  hasUnreadNotifications = false,
  onCityPress,
  onNotificationsPress,
}: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <button
        onClick={onCityPress}
        className="flex items-center gap-1 rounded-pill bg-white px-4 py-2 text-sm font-medium shadow-card"
      >
        {city} <span className="text-ink-400">▾</span>
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={onNotificationsPress}
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
          aria-label="Уведомления"
        >
          <Image src="/brand/icons/bell.svg" alt="" width={20} height={20} />
          {hasUnreadNotifications && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
          )}
        </button>

        <Link
          href="/profile"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card"
          aria-label="Профиль"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            "🙂"
          )}
        </Link>
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "components/feed"
cat > "components/feed/EventCard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import clsx from "clsx";

export interface EventCardData {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  seatsTotal: number;
  seatsTaken: number;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
}

interface EventCardProps {
  event: EventCardData;
  onApplyPress?: (eventId: string) => void;
  applied?: boolean;
  applying?: boolean;
}

// 3D-иконки категорий МЕСТО (тот же комплект, что и на главном экране).
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

export function EventCard({ event, onApplyPress, applied = false, applying = false }: EventCardProps) {
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;
  const isDisabled = isFull || applied || applying;
  const categoryLabel = event.trainingType?.name ?? event.category?.name;
  const categoryEmoji = event.trainingType?.emoji ?? event.category?.emoji;
  const categoryIcon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;

  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
        {categoryIcon ? (
          <div className="relative h-4 w-4 shrink-0">
            <Image src={categoryIcon} alt="" fill className="object-contain" sizes="16px" />
          </div>
        ) : (
          <span>{categoryEmoji}</span>
        )}
        <span>{categoryLabel}</span>
      </div>

      <h3 className="text-title mb-1">{event.title}</h3>

      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-600">
        <span>{formatDate(event.eventDate)}</span>
        <span>{formatTime(event.eventTime)}</span>
        {event.placeName && <span>{event.placeName}</span>}
      </div>

      {event.description && (
        <p className="mb-3 line-clamp-2 text-sm text-ink-600">{event.description}</p>
      )}

      {event.organizer && (
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
            {event.organizer.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.organizer.avatarUrl} alt={event.organizer.name} className="h-full w-full object-cover" />
            ) : (
              event.organizer.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="text-sm">
            <span className="font-medium text-ink-900">{event.organizer.name}</span>
            <span className="text-ink-400">, {event.organizer.age}</span>
            {event.organizer.ratingAvg > 0 && (
              <span className="ml-2 text-ink-600">
                ⭐ {event.organizer.ratingAvg.toFixed(1)} · {event.organizer.completedMeetingsCount} встреч
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-600">
          {isFull ? "Мест нет" : `Нужно ещё ${seatsLeft} чел.`}
        </span>
        <button
          onClick={() => onApplyPress?.(event.id)}
          disabled={isDisabled}
          className={clsx(
            "rounded-pill px-5 py-2 text-sm font-semibold",
            isDisabled ? "bg-ink-400/10 text-ink-400" : "bg-brand-gradient text-white shadow-cta active:scale-95"
          )}
        >
          {applied ? "Отклик отправлен" : applying ? "Отправляем..." : "Я иду"}
        </button>
      </div>
    </div>
  );
}

function formatDate(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatTime(timeString: string): string {
  return timeString.slice(0, 5);
}
ENDOFFILE

mkdir -p "components/chat"
cat > "components/chat/MessageBubble.tsx" << 'ENDOFFILE'
"use client";

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
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
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
        <span className={clsx("mt-1 block text-right text-[10px]", isOwn ? "text-white/70" : "text-ink-400")}>
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
ENDOFFILE

mkdir -p "app/chats/[id]"
cat > "app/chats/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { MessageBubble, type MessageData } from "@/components/chat/MessageBubble";
import { createBrowserRealtimeClient } from "@/lib/supabase/browser-realtime";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id: conversationId } = use(params);
  const router = useRouter();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-lavender-100 bg-white px-4 py-3">
        <button onClick={() => router.push("/chats")} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
        <span className="font-medium">Чат</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading && <p className="text-center text-ink-600">Загрузка...</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} isOwn={message.senderId === myUserId} />
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-lavender-100 bg-white p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Написать сообщение..."
          className="flex-1 rounded-pill border border-lavender-200 bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
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
ENDOFFILE

mkdir -p "app/(app)/chats"
cat > "app/(app)/chats/page.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChatListItem, type ChatListItemData } from "@/components/chat/ChatListItem";

export default function ChatsPage() {
  const [chats, setChats] = useState<ChatListItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setChats(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-5 py-6">
      <h1 className="text-display mb-4">Чаты</h1>

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}

      {!loading && chats.length === 0 && (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="relative mb-4 h-32 w-32">
            <Image src="/brand/3d/empty-chats.png" alt="" fill className="object-contain" sizes="128px" />
          </div>
          <p className="text-sm text-ink-600">Когда вас пригласят на встречу, чат появится здесь.</p>
        </div>
      )}

      <div className="space-y-2">
        {chats.map((chat) => (
          <ChatListItem key={chat.conversationId} chat={chat} />
        ))}
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/feed"
cat > "app/(app)/feed/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { TopBar } from "@/components/layout/TopBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { TrainingTypeSheet } from "@/components/home/TrainingTypeSheet";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import { Button } from "@/components/ui/Button";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

export default function FeedPage() {
  return (
    // useSearchParams требует Suspense-границу в Next.js App Router
    <Suspense>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageContent() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category");
  const typeFilter = searchParams.get("type");

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [events, setEvents] = useState<EventCardData[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => setAvatarUrl(data.avatarUrl ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {
        setCategories([]);
        setTrainingTypes([]);
      });
  }, []);

  useEffect(() => {
    setEvents([]);
    setPage(0);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, typeFilter]);

  async function loadPage(pageToLoad: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageToLoad) });
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить ленту.");
        return;
      }

      setEvents((prev) => (replace ? data.items : [...prev, ...data.items]));
      setHasMore(Boolean(data.hasMore));
      setPage(pageToLoad);
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(eventId: string) {
    if (appliedEventIds.has(eventId) || applyingEventId) return;
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();

      if (res.ok) {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Отклик отправлен! Организатор скоро ответит.");
      } else if (data.error === "already_applied") {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Ты уже откликался на эту встречу.");
      } else if (data.error === "event_full") {
        setToast("Мест уже не осталось.");
      } else if (data.error === "cannot_apply_to_own_event") {
        setToast("Это твоя встреча — не нужно откликаться на неё самому.");
      } else {
        setToast("Не получилось отправить отклик.");
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setApplyingEventId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div>
      <TopBar city="Тюмень" avatarUrl={avatarUrl} />

      <div className="px-5 pb-2 pt-6">
        <h1 className="text-display">
          Что хочешь сделать <span className="text-accent">сегодня?</span>
        </h1>
      </div>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      <div className="mt-8 space-y-3 px-5">
        <h2 className="text-title">Интересные встречи рядом</h2>

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-card bg-white shadow-card" />
            ))}
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="relative mb-4 h-32 w-32">
              <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="128px" />
            </div>
            <p className="text-sm text-ink-600">Сегодня пока тихо. Создайте первый план в своём городе.</p>
          </div>
        )}

        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            applied={appliedEventIds.has(event.id)}
            applying={applyingEventId === event.id}
            onApplyPress={handleApply}
          />
        ))}

        {hasMore && (
          <Button variant="secondary" onClick={() => loadPage(page + 1, false)} disabled={loading}>
            {loading ? "Загружаем..." : "Показать ещё"}
          </Button>
        )}
      </div>

      <TrainingTypeSheet
        open={sheetOpen}
        trainingTypes={trainingTypes}
        onClose={() => setSheetOpen(false)}
      />

      {toast && (
        <div className="fixed inset-x-5 bottom-24 z-50 rounded-card bg-ink-900 px-4 py-3 text-center text-sm text-white shadow-card">
          {toast}
        </div>
      )}
    </div>
  );
}
ENDOFFILE

