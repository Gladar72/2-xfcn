"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGuide } from "@/lib/mosya/guide";
import { Screen, dayLong } from "@/components/proto/ui";
import { KI, bg } from "@/components/proto/k";
import { Creature } from "@/components/brand/Creature";
import { ReviewSheet, type ReviewData } from "@/components/proto/ReviewSheet";
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
type Tab = 0 | 1 | 2;


/** «Мои встречи» (SCR.meets прототипа). */
export default function MyEventsPage() {
  // Вкладки прототипа: «Я иду» и «Создал» — предстоящие (по роли), «Прошли» — архив.
  const [tab, setTab] = useState<Tab>(0);
  const scope: Scope = tab === 2 ? "archive" : "upcoming";
  const [items, setItems] = useState<MyEvent[] | null>(null);
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
      .then((d) =>
        setUnread(
          ((d.items ?? []) as { unreadCount?: number; eventStatus?: string | null }[])
            .filter((i) => i.eventStatus !== "completed" && i.eventStatus !== "cancelled")
            .reduce((s, i) => s + (i.unreadCount || 0), 0)
        )
      )
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

  const shown = (items ?? []).filter((e) => (tab === 0 ? e.role !== "organizer" : tab === 1 ? e.role === "organizer" : true));
  const plural = (n: number, a: string, b: string, c: string) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c;
  };

  return (
    <Screen id="meets">
      <div className="k-top">
        <h1 className="k-h1">
          Мои <em>встречи</em>
        </h1>
        <Link className="k-rb k-g k-pr" href="/chats" aria-label="Чаты" style={{ position: "relative", overflow: "visible" }}>
          <span className="k-ic">
            <KI n="chat" />
            {unread > 0 && <span className="k-badge">{unread > 9 ? "9+" : unread}</span>}
          </span>
        </Link>
      </div>
      {hints.slice(0, 3).map((h) => (
        <div key={h.notificationId} className="k-mos k-g" style={{ paddingLeft: 8 }}>
          <span style={{ width: 46, height: 46, borderRadius: 23, flex: "none", ...bg(h.avatarUrl, 160) }} />
          <span className="k-t">
            <b>
              {h.name}
              {h.age ? `, ${h.age}` : ""}
            </b>{" "}
            хочет с тобой на встречу
          </span>
          <Link className="k-go k-pr" href={`/people/${h.userId}?invite=1`} onClick={() => markHintDone(h.notificationId)}>
            Позвать
          </Link>
          <button aria-label="Скрыть" className="k-pr" onClick={() => closeHint(h)} style={{ padding: 4, color: "var(--ink3)", flex: "none", display: "flex" }}>
            <KI n="x" style={{ width: 16, height: 16 }} />
          </button>
        </div>
      ))}
      <div className="k-tabs k-g">
        {(["Я иду", "Создал", "Прошли"] as const).map((t, i) => (
          <button key={t} className={`k-pr ${tab === i ? "k-on" : ""}`} onClick={() => setTab(i as Tab)}>
            {t}
          </button>
        ))}
      </div>
      <div className="k-list" key={tab}>
        {items === null && [0, 1, 2].map((i) => <div key={i} className="k-li k-g k-sk" style={{ height: 94 }} />)}
        {shown.map((e) => {
          const past = scope === "archive";
          const rv = reviewable.find((r) => r.eventId === e.id)?.reviewableMembers[0];
          const pill: [string, string] =
            e.status === "cancelled"
              ? ["Отменена", "k-wait"]
              : past
                ? rv
                  ? ["Оставь отзыв", "k-wait"]
                  : ["Завершена", "k-ok"]
                : e.role === "organizer"
                  ? e.pendingApplicationsCount > 0
                    ? [`${e.pendingApplicationsCount} ${plural(e.pendingApplicationsCount, "новая заявка", "новые заявки", "новых заявок")}`, "k-own"]
                    : ["Активна", "k-ok"]
                  : e.myStatus === "pending"
                    ? ["Ждём ответа организатора", "k-wait"]
                    : ["Тебя приняли", "k-ok"];
          return (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              className="k-li k-g k-pr"
              onClick={(ev) => {
                if (past && rv) {
                  ev.preventDefault();
                  setReview({ eventId: e.id, title: e.title, member: rv });
                }
              }}
            >
              <i style={bg(e.photoUrl, 240)} />
              <span className="k-x">
                <b>{e.title}</b>
                <small>
                  {dayLong(e.eventDate)}, {e.eventTime.slice(0, 5)}
                  {e.placeName ? ` · ${e.placeName}` : ""}
                </small>
                <span className={`k-pill ${pill[1]}`}>{pill[0]}</span>
              </span>
            </Link>
          );
        })}
      </div>
      {items !== null && shown.length === 0 && (
        <div className="k-cempty k-g" style={{ marginTop: 14 }}>
          <Creature size={84} variant="e" />
          <b>{tab === 2 ? "Прошедших встреч пока нет" : tab === 1 ? "Ты ещё ничего не создал" : "Ты пока никуда не идёшь"}</b>
          <span>
            {tab === 2
              ? "После встречи здесь можно оценить участников"
              : tab === 1
                ? "Создай встречу — люди рядом её увидят"
                : "Загляни на главную или создай свою встречу"}
          </span>
          <Link className="k-btn k-d k-pr" href={tab === 1 ? "/create" : "/feed"}>
            {tab === 1 ? "Создать встречу" : "Найти встречу"}
          </Link>
        </div>
      )}
      <ReviewSheet open={!!review} personName={review?.title ?? ""} onSubmit={sendReview} onClose={() => setReview(null)} />
    </Screen>
  );
}
