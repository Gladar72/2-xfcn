mkdir -p "app/api/notifications"
cat > "app/api/notifications/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const NOTIFICATIONS_LIMIT = 50;

/**
 * GET /api/notifications
 * Список уведомлений текущего пользователя с готовым для показа текстом.
 * Уведомления сами по себе (таблица notifications) хранят только type +
 * payload (jsonb с id-шниками) — здесь мы "досказываем" их до читаемой
 * строки, подтягивая названия встреч и т.п. одним пакетным запросом,
 * а не по одному на каждое уведомление.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: notifications, error } = await admin
    .from("notifications")
    .select("id, type, payload, is_read, created_at")
    .eq("user_id", currentUser.userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATIONS_LIMIT);

  if (error) {
    console.error("GET /api/notifications — ошибка запроса:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const items = notifications ?? [];

  const eventIds = Array.from(
    new Set(
      items
        .map((n) => (n.payload as Record<string, unknown>)?.eventId)
        .filter((id): id is string => typeof id === "string")
    )
  );

  const eventTitles = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await admin.from("events").select("id, title").in("id", eventIds);
    for (const event of events ?? []) eventTitles.set(event.id, event.title);
  }

  const result = items.map((n) => {
    const payload = n.payload as Record<string, unknown>;
    const eventId = typeof payload?.eventId === "string" ? payload.eventId : null;
    const eventTitle = eventId ? eventTitles.get(eventId) : undefined;

    return {
      id: n.id,
      type: n.type,
      isRead: n.is_read,
      createdAt: n.created_at,
      text: buildNotificationText(n.type, eventTitle),
      linkEventId: eventId,
      linkConversationId: typeof payload?.conversationId === "string" ? payload.conversationId : null,
    };
  });

  return NextResponse.json({ items: result });
}

/**
 * PATCH /api/notifications
 * Отмечает все уведомления пользователя прочитанными (вызывается при
 * открытии экрана уведомлений).
 */
export async function PATCH(_req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", currentUser.userId)
    .eq("is_read", false);

  return NextResponse.json({ status: "ok" });
}

function buildNotificationText(type: string, eventTitle: string | undefined): string {
  const title = eventTitle ? `«${eventTitle}»` : "встречу";
  switch (type) {
    case "new_application":
      return `Новый отклик на ${title}`;
    case "application_accepted":
      return `Тебя приняли на ${title}`;
    case "event_reminder":
      return `Скоро начнётся ${title}`;
    case "review_request":
      return `Оцени, как прошла ${title}`;
    case "boost_suggestion":
      return `Мало откликов на ${title} — можно поднять её в ленте`;
    case "new_message":
      return "Новое сообщение в чате";
    default:
      return "Новое уведомление";
  }
}
ENDOFFILE

mkdir -p "app/(app)/notifications"
cat > "app/(app)/notifications/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface NotificationItem {
  id: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  text: string;
  linkEventId: string | null;
  linkConversationId: string | null;
}

type Tab = "all" | "events" | "chats";

const MEETING_TYPES = new Set([
  "new_application",
  "application_accepted",
  "event_reminder",
  "review_request",
  "boost_suggestion",
]);

const TYPE_ICON: Record<string, string> = {
  new_application: "/brand/icons/users.svg",
  application_accepted: "/brand/icons/check.svg",
  event_reminder: "/brand/icons/clock.svg",
  review_request: "/brand/icons/star.svg",
  boost_suggestion: "/brand/icons/info.svg",
  new_message: "/brand/icons/chat.svg",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));

    // Отмечаем всё прочитанным при открытии экрана — как и большинство
    // приложений с уведомлениями (не по одному, а разом при заходе).
    fetch("/api/notifications", { method: "PATCH" });
  }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    if (tab === "chats") return items.filter((n) => n.type === "new_message");
    return items.filter((n) => MEETING_TYPES.has(n.type));
  }, [items, tab]);

  function handlePress(item: NotificationItem) {
    if (item.type === "new_application" && item.linkEventId) {
      router.push(`/events/${item.linkEventId}/applications`);
    } else if (item.linkConversationId) {
      router.push(`/chats/${item.linkConversationId}`);
    } else {
      router.push("/chats");
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/feed" aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </Link>
        <h1 className="text-title">Уведомления</h1>
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            ["all", "Все"],
            ["events", "Встречи"],
            ["chats", "Чаты"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-pill px-4 py-1.5 text-sm font-medium ${
              tab === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-600 shadow-card"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-sm text-ink-600">Загрузка...</p>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">Здесь появятся новые уведомления.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => handlePress(item)}
            className="flex w-full items-start gap-3 rounded-card bg-white p-4 text-left shadow-card"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender-100">
              <Image src={TYPE_ICON[item.type] ?? "/brand/icons/bell.svg"} alt="" width={18} height={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${item.isRead ? "text-ink-600" : "font-medium text-ink-900"}`}>{item.text}</p>
              <p className="mt-0.5 text-xs text-ink-400">{formatRelativeTime(item.createdAt)}</p>
            </div>
            {!item.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `${diffDays} дн назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
ENDOFFILE

mkdir -p "app/(app)/settings"
cat > "app/(app)/settings/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getTelegramWebApp } from "@/lib/telegram/webapp-client";

interface ProfileSummary {
  name: string;
  city: string;
}

const SUPPORT_BOT_URL = "https://t.me/Mesto_people_bot";

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setProfile({ name: data.name, city: data.city });
      });
  }, []);

  function handleClose() {
    getTelegramWebApp()?.close();
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-5 flex items-center gap-3">
        <Link href="/profile" aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </Link>
        <h1 className="text-title">Настройки</h1>
      </div>

      <Section title="Аккаунт">
        <Row href="/profile" label="Профиль" value={profile ? profile.name : undefined} icon="/brand/icons/profile.svg" />
        <Row href="/subscriptions" label="Мой тариф" icon="/brand/icons/gift.svg" />
        <Row href="/notifications" label="Уведомления" icon="/brand/icons/bell.svg" />
        <Row label="Город" value={profile?.city} icon="/brand/icons/location.svg" />
      </Section>

      <Section title="Помощь">
        <Row external href={SUPPORT_BOT_URL} label="Написать в поддержку" icon="/brand/icons/help.svg" />
      </Section>

      <Section title="О приложении">
        <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
          <div className="relative h-6 w-24">
            <Image src="/brand/logo/wordmark-purple.svg" alt="МЕСТО" fill className="object-contain object-left" />
          </div>
        </div>
      </Section>

      <button
        onClick={handleClose}
        className="mt-6 w-full rounded-pill border border-lavender-200 bg-white py-3.5 text-sm font-medium text-ink-600"
      >
        Закрыть приложение
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink-400">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
  href,
  external = false,
}: {
  label: string;
  value?: string;
  icon: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
      <Image src={icon} alt="" width={18} height={18} />
      <span className="flex-1 text-sm text-ink-900">{label}</span>
      {value && <span className="text-sm text-ink-400">{value}</span>}
      {href && <span className="text-ink-400">›</span>}
    </div>
  );

  if (!href) return content;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}
ENDOFFILE

mkdir -p "components/layout"
cat > "components/layout/TopBar.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  onCityPress?: () => void;
}

export function TopBar({ city, avatarUrl, onCityPress }: TopBarProps) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setHasUnread((data.items ?? []).some((n: { isRead: boolean }) => !n.isRead)))
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <button
        onClick={onCityPress}
        className="flex items-center gap-1 rounded-pill bg-white px-4 py-2 text-sm font-medium shadow-card"
      >
        {city} <Image src="/brand/icons/chevron-down.svg" alt="" width={14} height={14} />
      </button>

      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
          aria-label="Уведомления"
        >
          <Image src="/brand/icons/bell.svg" alt="" width={20} height={20} />
          {hasUnread && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
        </Link>

        <Link
          href="/profile"
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card"
          aria-label="Профиль"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Image src="/brand/icons/avatar-placeholder.svg" alt="" width={20} height={20} className="brightness-0 invert" />
          )}
        </Link>
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/profile"
cat > "app/(app)/profile/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { type Plan } from "@/lib/subscriptions/limits";

interface Profile {
  name: string;
  avatarUrl: string | null;
  age: number;
  city: string;
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedMeetingsCount: number;
  eventsOrganizedCount: number;
  eventsAttendedCount: number;
  memberSince: string;
}

interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodEnd?: string;
  events?: { used: number; limit: number | null };
  boosts?: { used: number; limit: number };
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/me/profile").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ])
      .then(([profileData, subData]) => {
        if (!profileData.error) setProfile(profileData);
        setSubscription(subData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
        <p className="text-ink-600">Не удалось загрузить профиль.</p>
      </div>
    );
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы повторный выбор того же файла тоже сработал
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Файл больше 5 МБ — выбери другое фото.");
      setTimeout(() => setUploadError(null), 3000);
      return;
    }

    setUploadingPhoto(true);
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError("Не получилось загрузить фото.");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
    } catch {
      setUploadError("Проблема с соединением.");
    } finally {
      setUploadingPhoto(false);
      setTimeout(() => setUploadError(null), 3000);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-semibold text-ink-600 shadow-card">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-white shadow-card active:scale-95"
            aria-label="Изменить фото"
          >
            {uploadingPhoto ? "…" : "✏️"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-display truncate">
            {profile.name}, {profile.age}
          </h1>
          <p className="text-sm text-ink-600">{profile.city}</p>
        </div>
        </div>

        <Link href="/settings" aria-label="Настройки" className="mt-1 shrink-0">
          <Image src="/brand/icons/settings.svg" alt="" width={22} height={22} />
        </Link>
      </div>

      {uploadError && <p className="mb-4 text-center text-sm text-red-600">{uploadError}</p>}

      {profile.bio && <p className="mb-6 text-sm text-ink-900">{profile.bio}</p>}

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatCard
          label="Рейтинг"
          value={profile.ratingCount > 0 ? profile.ratingAvg.toFixed(1) : "—"}
          emoji="⭐"
        />
        <StatCard label="Встреч состоялось" value={String(profile.completedMeetingsCount)} emoji="🤝" />
        <StatCard label="Создано встреч" value={String(profile.eventsOrganizedCount)} emoji="📋" />
      </div>

      <h2 className="text-title mb-3">Мой пакет</h2>
      {subscription?.active ? (
        <Link
          href="/subscriptions"
          className="mb-6 flex items-center justify-between rounded-card-lg bg-ink-900 p-5 text-white shadow-card-lg"
        >
          <div>
            <span className="text-lg font-bold">{PLAN_TITLES[subscription.plan!]}</span>
            <p className="text-sm text-white/70">
              до {new Date(subscription.periodEnd!).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <span className="text-white/70">→</span>
        </Link>
      ) : (
        <div className="mb-6 rounded-card bg-white p-5 text-center shadow-card">
          <p className="mb-3 text-sm text-ink-600">Подписки пока нет — она нужна для создания встреч.</p>
          <Link href="/subscriptions">
            <Button className="w-auto px-6">Оформить подписку</Button>
          </Link>
        </div>
      )}

      <Link
        href="/reviews"
        className="flex items-center justify-between rounded-card bg-white p-4 shadow-card"
      >
        <span className="text-sm font-medium text-ink-900">Отзывы после встреч</span>
        <span className="text-accent">→</span>
      </Link>
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-card bg-white p-3 text-center shadow-card">
      <div className="text-lg">{emoji}</div>
      <div className="text-lg font-bold text-ink-900">{value}</div>
      <div className="text-[11px] leading-tight text-ink-600">{label}</div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
ENDOFFILE

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

  const { data: messages, error } = await admin
    .from("messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_HISTORY_LIMIT);

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  return NextResponse.json({ messages: (messages ?? []).reverse() });
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

mkdir -p "lib/telegram"
cat > "lib/telegram/webapp-client.ts" << 'ENDOFFILE'
"use client";

/**
 * Telegram инжектит объект window.Telegram.WebApp через скрипт
 * https://telegram.org/js/telegram-web-app.js (подключается в app/layout.tsx).
 * Это официальный документированный глобальный объект Mini Apps API.
 *
 * Мы читаем initData именно отсюда, а не пытаемся собрать его вручную —
 * подпись (hash) для этой строки формирует сам Telegram на своей стороне.
 *
 * Перед продакшн-использованием свериться с актуальной документацией:
 * https://core.telegram.org/bots/webapps
 */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  openInvoice: (url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  close: () => void;
  MainButton: {
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Возвращает сырую initData-строку для отправки на backend, либо null вне Telegram. */
export function getInitData(): string | null {
  const webApp = getTelegramWebApp();
  if (!webApp || !webApp.initData) return null;
  return webApp.initData;
}
ENDOFFILE

