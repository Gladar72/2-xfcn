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
