"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReviewSheet } from "@/components/proto/ReviewSheet";
import { EmptyIll, Ic, Screen, Toast } from "@/components/proto/ui";
import { photoThumb } from "@/lib/photos/thumb";
import { goBack } from "@/lib/nav/back";

interface ReviewableMember {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface ReviewableEvent {
  eventId: string;
  title: string;
  eventDate: string;
  reviewableMembers: ReviewableMember[];
}

export default function ReviewsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ReviewableEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState<{ eventId: string; member: ReviewableMember } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Пришли из уведомления «Оцени, как прошла встреча» — /reviews?event=<id>
  const [focusEventId, setFocusEventId] = useState<string | null>(null);

  useEffect(() => {
    const eventParam = new URLSearchParams(window.location.search).get("event");
    setFocusEventId(eventParam);
    load(eventParam, true);
  }, []);

  function load(focusId: string | null = focusEventId, autoOpen = false) {
    setLoading(true);
    fetch("/api/reviews/reviewable")
      .then((r) => r.json())
      .then((data) => {
        let list: ReviewableEvent[] = data.events ?? [];
        if (focusId) {
          // Нужную встречу — наверх и сразу открываем форму оценки.
          list = [...list.filter((e) => e.eventId === focusId), ...list.filter((e) => e.eventId !== focusId)];
          const target = list.find((e) => e.eventId === focusId);
          const first = target?.reviewableMembers[0];
          if (autoOpen && target && first) setActiveTarget({ eventId: target.eventId, member: first });
        }
        setEvents(list);
      })
      .finally(() => setLoading(false));
  }

  const focusDone = !!focusEventId && !loading && !events.some((e) => e.eventId === focusEventId);

  async function handleSubmit(data: {
    rating: number;
    arrivedOnTime: boolean;
    pleasantCommunication: boolean;
    meetingHappened: boolean;
    wouldMeetAgain: boolean;
  }) {
    if (!activeTarget) return;
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: activeTarget.eventId,
          revieweeId: activeTarget.member.id,
          rating: data.rating,
          arrivedOnTime: data.arrivedOnTime,
          pleasantCommunication: data.pleasantCommunication,
          meetingHappened: data.meetingHappened,
          wouldMeetAgain: data.wouldMeetAgain,
        }),
      });
      if (res.ok) {
        setToast("Спасибо за отзыв!");
        setActiveTarget(null);
        load(focusEventId, true);
      } else {
        setToast("Не получилось отправить отзыв.");
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <Screen id="reviews" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => goBack(router, "/profile")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Отзывы <em>после встреч</em>
      </h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5 }}>
        Оцени тех, с кем встречался — так в «Месте» остаются надёжные люди.
      </p>
      {loading && [0, 1].map((i) => <div key={i} className="sk" style={{ height: 64, marginTop: 10 }} />)}
      {focusDone && <div className="note gl" style={{ marginTop: 14 }}>Эту встречу ты уже оценил — спасибо!</div>}
      {!loading && events.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <EmptyIll a={["cloud", "mint", "calm"]} b={["ball", "lilac", "smile"]} c={["star", "peach", "sly"]} />
          <b>Оценивать пока некого</b>
          <span>После каждой встречи здесь появятся её участники.</span>
        </div>
      )}
      {events.map((e) => (
        <div key={e.eventId} className="blk" style={{ marginTop: 18 }}>
          <div className="blk-h">
            <b>{e.title}</b>
            <span>{new Date(e.eventDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
          </div>
          {e.reviewableMembers.map((m) => (
            <div key={m.id} className="apl gl">
              {m.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoThumb(m.avatar_url, 88)} alt="" />
              ) : (
                <span className="hav r" style={{ width: 44, height: 44 }}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div>
                <b>{m.name}</b>
                <span>Участник встречи</span>
              </div>
              <button className="sm yes" onClick={() => setActiveTarget({ eventId: e.eventId, member: m })}>
                Оценить
              </button>
            </div>
          ))}
        </div>
      ))}
      <ReviewSheet open={!!activeTarget} personName={activeTarget?.member.name ?? ""} onSubmit={handleSubmit} onClose={() => setActiveTarget(null)} />
      <Toast text={toast} />
    </Screen>
  );
}
