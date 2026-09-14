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

/**
 * Проверяет при каждом заходе в приложение, есть ли завершённые встречи,
 * которые пользователь ещё не оценил — и если да, сразу показывает модалку
 * с формой отзыва поверх текущего экрана (см. запрос: "вылазит окно с
 * отзывом и оценкой"). Один вызов /api/reviews/reviewable по пути заодно
 * лениво переводит просроченные встречи в completed (см. lib/reviews/).
 */
export function PendingReviewModal() {
  const [queue, setQueue] = useState<{ eventId: string; member: ReviewableMember }[]>([]);

  useEffect(() => {
    fetch("/api/reviews/reviewable")
      .then((r) => r.json())
      .then((data) => {
        const events: ReviewableEvent[] = data.events ?? [];
        const flat = events.flatMap((e) => e.reviewableMembers.map((member) => ({ eventId: e.eventId, member })));
        setQueue(flat);
      })
      .catch(() => {});
  }, []);

  if (queue.length === 0) return null;

  const current = queue[0];
  if (!current) return null;
  const currentEventId = current.eventId;
  const currentMember = current.member;

  async function handleSubmit(data: {
    rating: number;
    arrivedOnTime: boolean;
    pleasantCommunication: boolean;
    meetingHappened: boolean;
    wouldMeetAgain: boolean;
  }) {
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: currentEventId,
        revieweeId: currentMember.id,
        ...data,
      }),
    });
    setQueue((prev) => prev.slice(1));
  }

  function handleSkip() {
    setQueue((prev) => prev.slice(1));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-4">
      <div className="w-full max-w-md">
        <ReviewForm personName={currentMember.name} onSubmit={handleSubmit} onCancel={handleSkip} />
      </div>
    </div>
  );
}
