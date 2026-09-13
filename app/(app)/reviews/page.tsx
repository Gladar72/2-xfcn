"use client";

import { useEffect, useState } from "react";
import { ReviewForm } from "@/components/reviews/ReviewForm";

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
  const [events, setEvents] = useState<ReviewableEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState<{ eventId: string; member: ReviewableMember } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/reviews/reviewable")
      .then((r) => r.json())
      .then((data) => setEvents(data.events ?? []))
      .finally(() => setLoading(false));
  }

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
        load();
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
    <div className="px-5 py-6">
      <h1 className="text-display mb-4">Отзывы</h1>

      {loading && <p className="text-center text-ink-600">Загрузка...</p>}

      {!loading && events.length === 0 && (
        <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
          Пока нет завершённых встреч, которые можно оценить.
        </div>
      )}

      <div className="space-y-6">
        {events.map((event) => (
          <div key={event.eventId}>
            <h2 className="mb-2 text-sm font-medium text-ink-600">{event.title}</h2>
            <div className="space-y-2">
              {event.reviewableMembers.map((member) =>
                activeTarget?.eventId === event.eventId && activeTarget.member.id === member.id ? (
                  <ReviewForm
                    key={member.id}
                    personName={member.name}
                    onSubmit={handleSubmit}
                    onCancel={() => setActiveTarget(null)}
                  />
                ) : (
                  <button
                    key={member.id}
                    onClick={() => setActiveTarget({ eventId: event.eventId, member })}
                    className="flex w-full items-center gap-3 rounded-card bg-white p-3 text-left shadow-card"
                  >
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
                      {member.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.avatar_url} alt={member.name} className="h-full w-full object-cover" />
                      ) : (
                        member.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="font-medium text-ink-900">{member.name}</span>
                    <span className="ml-auto text-sm text-accent">Оценить →</span>
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed inset-x-5 bottom-24 z-50 rounded-card bg-ink-900 px-4 py-3 text-center text-sm text-white shadow-card">
          {toast}
        </div>
      )}
    </div>
  );
}
