"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReviewSheet } from "@/components/proto/ReviewSheet";
import { EmptyIll, Ic, Screen, Toast } from "@/components/proto/ui";
import { photoThumb } from "@/lib/photos/thumb";
import { goBack } from "@/lib/nav/back";
import { getJson } from "@/lib/http/get-json";

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
  const [loadError, setLoadError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const [activeTarget, setActiveTarget] = useState<{ eventId: string; title: string; member: ReviewableMember } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Пришли из уведомления «Оцени, как прошла встреча» — /reviews?event=<id>
  const [focusEventId, setFocusEventId] = useState<string | null>(null);

  const load = useCallback((focusId: string | null, autoOpen = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setLoadError(false);
    getJson<{ events: ReviewableEvent[] }>("/api/reviews/reviewable", controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        let list: ReviewableEvent[] = data.events ?? [];
        if (focusId) {
          // Нужную встречу — наверх и сразу открываем форму оценки.
          list = [...list.filter((e) => e.eventId === focusId), ...list.filter((e) => e.eventId !== focusId)];
          const target = list.find((e) => e.eventId === focusId);
          const first = target?.reviewableMembers[0];
          if (autoOpen && target && first) setActiveTarget({ eventId: target.eventId, title: target.title, member: first });
        }
        setEvents(list);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    const eventParam = new URLSearchParams(window.location.search).get("event");
    setFocusEventId(eventParam);
    load(eventParam, true);
    return () => request.current?.abort();
  }, [load]);

  const focusDone = !!focusEventId && !loading && !loadError && !events.some((e) => e.eventId === focusEventId);

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
        Оцени, как прошла встреча — так в «Месте» остаются хорошие события.
      </p>
      {loading && [0, 1].map((i) => <div key={i} className="sk" style={{ height: 64, marginTop: 10 }} />)}
      {focusDone && <div className="note gl" style={{ marginTop: 14 }}>Эту встречу ты уже оценил — спасибо!</div>}
      {loadError && <div className="empty" role="alert" style={{ marginTop: 20 }}>
        <b>Не удалось загрузить отзывы.</b>
        <button className="btn v" onClick={() => load(focusEventId, true)}>Попробовать снова</button>
      </div>}
      {!loading && !loadError && events.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <EmptyIll a={["cloud", "mint", "calm"]} b={["ball", "lilac", "smile"]} c={["star", "peach", "sly"]} />
          <b>Оценивать пока некого</b>
          <span>После каждой встречи здесь можно будет её оценить.</span>
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
                <span>Организатор · оцени встречу</span>
              </div>
              <button className="sm yes" onClick={() => setActiveTarget({ eventId: e.eventId, title: e.title, member: m })}>
                Оценить
              </button>
            </div>
          ))}
        </div>
      ))}
      <ReviewSheet open={!!activeTarget} personName={activeTarget?.title ?? ""} onSubmit={handleSubmit} onClose={() => setActiveTarget(null)} />
      <Toast text={toast} />
    </Screen>
  );
}
