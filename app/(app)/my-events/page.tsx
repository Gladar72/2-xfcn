"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGuide } from "@/lib/mosya/guide";
import { Cover, EmptyIll, Ic, Screen, dayLong, eventIcon } from "@/components/proto/ui";
import { ReviewSheet, type ReviewData } from "@/components/proto/ReviewSheet";

interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  category: { slug: string; name: string; emoji: string | null } | null;
  isBusiness: boolean;
  photoUrl: string | null;
  role: "organizer" | "participant";
  myStatus?: "member" | "pending";
  pendingApplicationsCount: number;
}
interface Reviewable {
  eventId: string;
  reviewableMembers: { id: string; name: string }[];
}
type Scope = "upcoming" | "archive";

const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** «Мои встречи» (SCR.meets прототипа). */
export default function MyEventsPage() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [items, setItems] = useState<MyEvent[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [reviewable, setReviewable] = useState<Reviewable[]>([]);
  const [review, setReview] = useState<{ eventId: string; member: { id: string; name: string } } | null>(null);
  useGuide("myEvents");

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => setUnread((d.items ?? []).reduce((s: number, i: { unreadCount?: number }) => s + (i.unreadCount || 0), 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetch(`/api/me/events?scope=${scope}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setItems(data.items ?? []))
      .catch(() => !cancelled && setItems([]));
    if (scope === "archive")
      fetch("/api/reviews/reviewable")
        .then((r) => r.json())
        .then((d) => !cancelled && setReviewable(d.events ?? []))
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scope]);

  async function sendReview(d: ReviewData) {
    if (!review) return;
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: review.eventId, revieweeId: review.member.id, ...d }),
    }).catch(() => {});
    setReviewable((list) =>
      list.map((e) => (e.eventId === review.eventId ? { ...e, reviewableMembers: e.reviewableMembers.filter((m) => m.id !== review.member.id) } : e))
    );
    setReview(null);
  }

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const shown = (items ?? []).filter((e) => scope !== "upcoming" || !day || e.eventDate.slice(0, 10) === day);

  return (
    <Screen id="meets">
      <div className="top">
        <h1 className="t">
          Мои <em>встречи</em>
        </h1>
        <Link className="rb gl" href="/chats" aria-label="Чаты">
          <Ic n="chat" />
          {unread > 0 && <span className="cnt">{unread > 9 ? "9+" : unread}</span>}
        </Link>
      </div>
      <div className="seg gl">
        <span className="si" style={{ width: "calc(50% - 4px)", transform: scope === "archive" ? "translateX(100%)" : "none" }} />
        <button className={scope === "upcoming" ? "on" : ""} onClick={() => setScope("upcoming")}>
          Предстоящие
        </button>
        <button className={scope === "archive" ? "on" : ""} onClick={() => setScope("archive")}>
          Архив
        </button>
      </div>
      {scope === "upcoming" && (
        <div className="week gl">
          {week.map((d) => {
            const k = iso(d);
            const has = (items ?? []).some((e) => e.eventDate.slice(0, 10) === k);
            return (
              <button key={k} className={`${day === k || (!day && k === iso(week[0]!)) ? "on" : ""} ${has ? "has" : ""}`} onClick={() => setDay(day === k ? null : k)}>
                <span>{WD[d.getDay()]}</span>
                <b>{d.getDate()}</b>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <div className="list rvu" key={`${scope}-${day ?? ""}`}>
          {items === null && [0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 76 }} />)}
          {shown.map((e) => {
            const past = scope === "archive";
            const rv = reviewable.find((r) => r.eventId === e.id)?.reviewableMembers[0];
            const st =
              e.status === "cancelled"
                ? "Отменена"
                : past
                  ? "Завершена"
                  : e.role === "organizer"
                    ? "Активна"
                    : e.myStatus === "pending"
                      ? "Ждём ответа"
                      : "Ты в деле";
            return (
              <Link key={e.id} href={`/events/${e.id}`} className={`row gl ${past ? "past" : ""}`}>
                <span className="thw">
                  <Cover photoUrl={e.photoUrl} icon={eventIcon(e)} cls="th" thumb={140} />
                  {e.pendingApplicationsCount > 0 && <span className="redn abs">{e.pendingApplicationsCount}</span>}
                </span>
                <div className="i">
                  <b>{e.title}</b>
                  <span>
                    {dayLong(e.eventDate)}, {e.eventTime.slice(0, 5)}
                    {e.placeName ? ` · ${e.placeName}` : ""}
                  </span>
                  <span>
                    <span className={`role ${e.role === "organizer" ? "org" : ""}`}>{e.role === "organizer" ? "Организатор" : "Участник"}</span>
                    <span className={`stt ${st === "Ждём ответа" ? "w" : ""}`}>{st}</span>
                  </span>
                </div>
                {e.role === "organizer" && !past && (
                  <span className="go-s" style={{ display: "grid", placeItems: "center" }} aria-label="Редактировать">
                    <Ic n="edit" c="xs" />
                  </span>
                )}
                {past && rv && (
                  <button
                    className="go-s"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setReview({ eventId: e.id, member: rv });
                    }}
                  >
                    Оценить
                  </button>
                )}
              </Link>
            );
          })}
        </div>
        {items !== null && shown.length === 0 && (
          <div className="empty" style={{ paddingTop: 14 }}>
            <EmptyIll a={["cloud", "mint", "calm"]} b={["ball", "lilac", "calm"]} c={["squ", "pink", "smile"]} />
            <span>
              {scope === "archive"
                ? "Здесь будут прошедшие встречи — после них можно оценить участников."
                : day
                  ? "В этот день встреч нет."
                  : "Ты пока никуда не идёшь — загляни в ленту или создай свою встречу."}
            </span>
            {scope === "upcoming" && !day && (
              <Link className="btn k" href="/feed" style={{ marginTop: 6, width: "auto", padding: "0 22px", height: 46 }}>
                Найти встречу
              </Link>
            )}
          </div>
        )}
      </div>
      <ReviewSheet open={!!review} personName={review?.member.name ?? ""} onSubmit={sendReview} onClose={() => setReview(null)} />
    </Screen>
  );
}
