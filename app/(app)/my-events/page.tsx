"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGuide } from "@/lib/mosya/guide";
import { Cover, EmptyIll, Ic, Screen, dayLong, eventIcon } from "@/components/proto/ui";
import { ReviewSheet, type ReviewData } from "@/components/proto/ReviewSheet";
import { photoThumb } from "@/lib/photos/thumb";
import { doneHints, markHintDone } from "@/lib/meet-hints";

interface MeetHint {
  notificationId: string;
  userId: string;
  name: string;
  age: number | null;
  avatarUrl: string | null;
}

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
  const [review, setReview] = useState<{ eventId: string; title: string; member: { id: string; name: string } } | null>(null);
  useGuide("myEvents");
  // «Марина хочет с тобой на встречу» — намёки, которые ещё не разобраны.
  const [hints, setHints] = useState<MeetHint[]>([]);
  useEffect(() => {
    fetch("/api/me/meet-hints")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const done = doneHints();
        setHints(((d?.items ?? []) as MeetHint[]).filter((h) => !done.has(h.notificationId)));
      })
      .catch(() => {});
  }, []);
  function closeHint(h: MeetHint) {
    markHintDone(h.notificationId);
    setHints((l) => l.filter((x) => x.notificationId !== h.notificationId));
  }

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
      {hints.slice(0, 3).map((h) => (
        <div key={h.notificationId} className="gl" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 14px", borderRadius: 22, margin: "14px 0 0" }}>
          <span style={{ position: "relative", width: 46, height: 46, flex: "none" }}>
            {h.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(h.avatarUrl, 120)} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <span style={{ display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: "50%", background: "var(--g)", color: "#fff", fontWeight: 600 }}>
                {h.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span style={{ position: "absolute", right: -4, bottom: -4, fontSize: 18, lineHeight: 1 }}>👋</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 14.5, lineHeight: 1.25 }}>
              {h.name}
              {h.age ? `, ${h.age}` : ""} хочет с тобой на встречу
            </b>
            <span className="muted" style={{ display: "block", fontSize: 12.5, marginTop: 2 }}>
              Позови куда-нибудь вместе
            </span>
          </span>
          <Link
            className="btn v"
            href={`/people/${h.userId}?invite=1`}
            onClick={() => markHintDone(h.notificationId)}
            style={{ width: "auto", height: 38, minHeight: 38, padding: "0 14px", fontSize: 14, flex: "none" }}
          >
            Позвать
          </Link>
          <button aria-label="Скрыть" onClick={() => closeHint(h)} style={{ background: "none", border: 0, padding: 4, color: "inherit", opacity: 0.5, flex: "none" }}>
            <Ic n="close" c="xs" />
          </button>
        </div>
      ))}
      <div className="seg gl" style={hints.length ? { marginTop: 14 } : undefined}>
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
                      setReview({ eventId: e.id, title: e.title, member: rv });
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
      <ReviewSheet open={!!review} personName={review?.title ?? ""} onSubmit={sendReview} onClose={() => setReview(null)} />
    </Screen>
  );
}
