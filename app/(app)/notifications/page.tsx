"use client";

import { useEffect, useMemo, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import { photoThumb } from "@/lib/photos/thumb";
import { EmptyIll, Ic, Screen } from "@/components/proto/ui";
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
  new_application: "/brand/mosya/mosya_phone.webp",
  application_accepted: "/brand/mosya/mosya_jump.webp",
  event_reminder: "/brand/mosya/mosya_think.webp",
  event_soon: "/brand/mosya/mosya_run.webp",
  application_rejected: "/brand/mosya/mosya_sit.webp",
  subscription_expiring: "/brand/mosya/mosya_glasses.webp",
  subscription_expired: "/brand/mosya/mosya_glasses.webp",
  review_request: "/brand/mosya/mosya_wave.webp",
  boost_suggestion: "/brand/mosya/mosya_jump.webp",
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
    <Screen id="notif" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Уведомления
      </h1>
      <div className="chipsrow" style={{ marginTop: 14 }}>
        {(
          [
            ["all", "Все"],
            ["events", "Встречи"],
            ["chats", "Чаты"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? "on" : "gl"}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {loading && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 66, marginTop: 8 }} />)}
      {!loading && filtered.length === 0 && (
        <div className="empty" style={{ marginTop: 24 }}>
          <EmptyIll a={["cloud", "mint", "calm"]} b={["ball", "lilac", "smile"]} c={["star", "peach", "sly"]} />
          <b>Пока тихо</b>
          <span>Здесь появятся заявки, ответы организаторов и напоминания о встречах.</span>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label}>
          <span className="lbl">{g.label}</span>
          {g.items.map((item) => {
            const rich = item.event && (item.type === "application_accepted" || item.type === "event_soon") && item.event.status !== "cancelled";
            if (rich && item.event) {
              const e = item.event;
              return (
                <div key={item.id} className="ntrich">
                  <span className="pill glass">{item.type === "event_soon" ? "Скоро встреча" : "Ты в деле!"}</span>
                  <b>{item.type === "event_soon" ? "Встречаемся через 2 часа" : "Участие подтверждено"}</b>
                  <span>
                    {e.title} · {dayLabel(e.eventDate).toLowerCase()}, {e.eventTime.slice(0, 5)}
                  </span>
                  <div className="twob" style={{ marginTop: 8 }}>
                    <button className="btn o" onClick={() => router.push(`/events/${e.id}`)}>
                      Открыть встречу
                    </button>
                    {e.isBusiness && item.ticketCode ? (
                      <button className="btn o" onClick={() => router.push(`/events/${e.id}/ticket`)}>
                        Билет
                      </button>
                    ) : (
                      <button className="btn o" onClick={() => router.push(item.eventConversationId ? `/chats/${item.eventConversationId}` : "/chats")}>
                        Чат
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            const img = item.event?.photoUrl;
            return (
              <button key={item.id} className={`nt gl ${item.isRead ? "" : "unread"}`} style={{ width: "100%", textAlign: "left" }} onClick={() => handlePress(item)}>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoThumb(img, 92)} alt="" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={TYPE_ICON[item.type] ?? "/brand/mosya/mosya_wave.webp"} alt="" style={{ objectFit: "contain", background: "#EFE8FF" }} />
                )}
                <div>
                  <NotifText text={item.text} />
                  <small>{timeAgo(item.createdAt)}</small>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </Screen>
  );
}

/** Первая часть до «—» или «:» — жирным, как в прототипе. */
function NotifText({ text }: { text: string }) {
  const m = text.match(/^(.+?)([:—].*)$/);
  if (!m) return <b style={{ fontWeight: 500 }}>{text}</b>;
  return (
    <>
      <b style={{ fontWeight: 500 }}>{m[1]}</b>
      {m[2]}
    </>
  );
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ч назад`;
  return d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  const tm = new Date();
  tm.setDate(t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  if (d.toDateString() === tm.toDateString()) return "Завтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
