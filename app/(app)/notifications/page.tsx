"use client";

import { useEffect, useMemo, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import { Icon } from "@/components/brand/Icon";
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
  event: {
    id: string;
    title: string;
    photoUrl: string | null;
    eventDate: string;
    eventTime: string;
    placeName: string | null;
    address: string | null;
    isBusiness: boolean;
    status: string;
  } | null;
  ticketCode: string | null;
  eventConversationId: string | null;
}

type Tab = "all" | "events" | "chats";

const MEETING_TYPES = new Set([
  "new_application",
  "application_accepted",
  "event_reminder",
  "event_soon",
  "application_rejected",
  "review_request",
  "boost_suggestion",
]);

const TYPE_ICON: Record<string, string> = {
  new_application: "/brand/3d/applications-icon.png",
  application_accepted: "/brand/3d/icon-calendar.png",
  event_reminder: "/brand/3d/icon-clock.png",
  event_soon: "/brand/3d/icon-clock.png",
  application_rejected: "/brand/3d/icon-document.png",
  subscription_expiring: "/brand/3d/subscription-coins.png",
  subscription_expired: "/brand/3d/subscription-coins.png",
  review_request: "/brand/3d/icon-badge.png",
  boost_suggestion: "/brand/3d/boost-icon.png",
  new_message: "/brand/mosya/mosya_phone.webp",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  useGuide("notifications");
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

  // Группы «Сегодня / Вчера / 3 октября» — как на макете.
  const groups = useMemo(() => {
    const result: { label: string; items: NotificationItem[] }[] = [];
    for (const item of filtered) {
      const label = dayLabel(item.createdAt);
      const last = result[result.length - 1];
      if (last && last.label === label) last.items.push(item);
      else result.push({ label, items: [item] });
    }
    return result;
  }, [filtered]);

  function handlePress(item: NotificationItem) {
    if (item.type === "subscription_expiring" || item.type === "subscription_expired") {
      router.push("/subscriptions");
    } else if (item.type === "review_request") {
      // Оценка встречи — сразу на форму оценки, а не на страницу события
      // (там нет кнопки «Оценить», человек проваливался и не мог оценить).
      router.push(item.linkEventId ? `/reviews?event=${item.linkEventId}` : "/reviews");
    } else if (item.type === "new_application" && item.linkEventId) {
      router.push(`/events/${item.linkEventId}/applications`);
    } else if (item.linkEventId && item.type !== "new_message") {
      router.push(`/events/${item.linkEventId}`);
    } else if (item.linkConversationId) {
      router.push(`/chats/${item.linkConversationId}`);
    } else {
      router.push("/chats");
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/feed" aria-label="Назад" className="m-glass m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <Icon name="back" size={22} className="" />
        </Link>
        <h1 className="m-title text-[28px]">Уведомления</h1>
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
              tab === value ? "bg-brand-gradient text-white shadow-cta" : "m-glass text-ink-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="m-sk h-24" />)}</div>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/mosya/mosya_think.webp" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">Здесь появятся новые уведомления.</p>
        </div>
      )}

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="pt-1 text-center text-xs text-ink-400">{group.label}</p>
            {group.items.map((item) =>
              isRichCard(item) ? (
                <RichCard key={item.id} item={item} onOpen={() => handlePress(item)} />
              ) : (
          <button
            key={item.id}
            onClick={() => handlePress(item)}
            className="flex w-full items-start gap-3 rounded-card m-glass p-4 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender-100">
              <Image src={TYPE_ICON[item.type] ?? "/brand/3d/icon-bell.png"} alt="" width={24} height={24} className="object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${item.isRead ? "text-ink-600" : "font-medium text-ink-900"}`}>{item.text}</p>
              <p className="mt-0.5 text-xs text-ink-400">{formatRelativeTime(item.createdAt)}</p>
            </div>
            {!item.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </button>
              )
            )}
          </div>
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
  if (diffHours < 6) return `${diffHours} ч назад`;
  // День уже виден в заголовке группы («Вчера», «27 сентября») — здесь только время.
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Карточка с событием внутри: «Ты в деле!» и «Встречаемся через 2 часа». */
function isRichCard(item: NotificationItem): item is NotificationItem & { event: NonNullable<NotificationItem["event"]> } {
  return (
    !!item.event &&
    item.event.status !== "cancelled" &&
    (item.type === "application_accepted" || item.type === "event_soon")
  );
}

function RichCard({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const router = useRouter();
  const event = item.event;
  if (!event) return null;
  const soon = item.type === "event_soon";
  const time = event.eventTime.slice(0, 5);

  return (
    <div className="rounded-card-lg m-glass p-4">
      <button onClick={onOpen} className="mb-3 flex w-full items-center gap-3 text-left">
        <div className="relative h-12 w-12 shrink-0">
          <Image
            src={soon ? "/brand/3d/icon-clock.png" : "/mesto/assets/icons/png/ticket.png"}
            alt=""
            fill
            className="object-contain"
            sizes="48px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink-900">{soon ? "Встречаемся через 2 часа" : "Ты в деле!"}</p>
          <p className="text-sm text-ink-600">
            {soon ? `${formatDay(event.eventDate)} · ${time}` : "Участие подтверждено"}
          </p>
        </div>
        {!item.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
        <span className="shrink-0 text-lg text-ink-400">›</span>
      </button>

      <button onClick={() => router.push(`/events/${event.id}`)} className="flex w-full gap-3 text-left">
        {event.photoUrl && (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card-sm">
            <Image src={event.photoUrl} alt="" fill className="object-cover" sizes="96px" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 line-clamp-2 text-sm font-semibold text-ink-900">{event.title}</p>
          <p className="mb-1 flex items-center gap-1.5 text-sm text-ink-900">
            <Icon name="cal" size={18} className="shrink-0 text-accent" />
            {formatDay(event.eventDate)} · {time}
          </p>
          {(event.placeName || event.address) && (
            <div className="flex items-start gap-1.5 text-sm">
              <Icon name="pin" size={18} className="mt-px shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="truncate text-ink-900">{event.placeName ?? event.address}</p>
                {event.placeName && event.address && <p className="truncate text-xs text-ink-600">{event.address}</p>}
              </div>
            </div>
          )}
        </div>
      </button>

      {soon && item.ticketCode && (
        <button
          onClick={() => router.push(`/events/${event.id}/ticket`)}
          className="mt-3 flex w-full items-center gap-2 rounded-pill bg-lavender-100 px-4 py-2.5 text-sm font-medium text-accent"
        >
          <Image src="/mesto/assets/icons/png/ticket.png" alt="" width={22} height={22} className="object-contain" />
          Твой билет · {item.ticketCode}
        </button>
      )}

      <div className="mt-3 space-y-2">
        {item.ticketCode ? (
          <button
            onClick={() => router.push(`/events/${event.id}/ticket`)}
            className="w-full rounded-pill bg-brand-gradient py-3.5 text-base font-semibold text-white shadow-cta m-btn-v relative overflow-hidden"
          >
            Открыть билет
          </button>
        ) : (
          <button
            onClick={() => router.push(`/events/${event.id}`)}
            className="w-full rounded-pill bg-brand-gradient py-3.5 text-base font-semibold text-white shadow-cta m-btn-v relative overflow-hidden"
          >
            Открыть встречу
          </button>
        )}
        {soon && item.eventConversationId && (
          <button
            onClick={() => router.push(`/chats/${item.eventConversationId}`)}
            className="w-full rounded-pill bg-lavender-100 py-3.5 text-base font-semibold text-accent"
          >
            Чат события
          </button>
        )}
      </div>
    </div>
  );
}

function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDay(dateIso: string): string {
  const today = new Date();
  if (dateIso === toIsoDay(today)) return "Сегодня";
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (dateIso === toIsoDay(tomorrow)) return "Завтра";
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (toIsoDay(d) === toIsoDay(today)) return "Сегодня";
  if (toIsoDay(d) === toIsoDay(new Date(today.getTime() - 86_400_000))) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
