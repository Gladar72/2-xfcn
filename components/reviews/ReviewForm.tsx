"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface ReviewFormProps {
  personName: string;
  onSubmit: (data: {
    rating: number;
    arrivedOnTime: boolean;
    pleasantCommunication: boolean;
    meetingHappened: boolean;
    wouldMeetAgain: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}

export function ReviewForm({ personName, onSubmit, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [arrivedOnTime, setArrivedOnTime] = useState(true);
  const [pleasantCommunication, setPleasantCommunication] = useState(true);
  const [meetingHappened, setMeetingHappened] = useState(true);
  const [wouldMeetAgain, setWouldMeetAgain] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ rating, arrivedOnTime, pleasantCommunication, meetingHappened, wouldMeetAgain });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card bg-white p-5 shadow-card">
      <h3 className="text-title">Как прошла встреча с {personName}?</h3>

      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            className="text-3xl transition-transform active:scale-90"
          >
            {star <= rating ? "⭐" : "☆"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <ToggleRow label="Пришёл(-ла) вовремя" value={arrivedOnTime} onChange={setArrivedOnTime} />
        <ToggleRow label="Приятное общение" value={pleasantCommunication} onChange={setPleasantCommunication} />
        <ToggleRow label="Встреча состоялась" value={meetingHappened} onChange={setMeetingHappened} />
        <ToggleRow label="Готов(а) встретиться снова" value={wouldMeetAgain} onChange={setWouldMeetAgain} />
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} className="w-auto flex-1">
          Отмена
        </Button>
        <Button onClick={handleSubmit} disabled={rating === 0 || submitting} className="flex-1">
          {submitting ? "Отправляем..." : "Отправить"}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-card bg-background px-4 py-3 text-sm"
    >
      <span className="text-ink-900">{label}</span>
      <span
        className={`flex h-6 w-11 items-center rounded-pill p-0.5 transition-colors ${
          value ? "bg-accent" : "bg-ink-400/20"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-pill bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
