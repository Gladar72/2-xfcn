"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./ui";

export interface ReviewData {
  rating: number;
  arrivedOnTime: boolean;
  pleasantCommunication: boolean;
  meetingHappened: boolean;
  wouldMeetAgain: boolean;
}

const TOGGLES: [keyof Omit<ReviewData, "rating">, string][] = [
  ["arrivedOnTime", "Пришёл(-ла) вовремя"],
  ["pleasantCommunication", "Приятное общение"],
  ["meetingHappened", "Встреча состоялась"],
  ["wouldMeetAgain", "Готов(а) встретиться снова"],
];

/** «Как прошла встреча с …?» (reviewSheet прототипа): звёзды + 4 переключателя. */
export function ReviewSheet({
  open,
  personName,
  onSubmit,
  onClose,
}: {
  open: boolean;
  personName: string;
  onSubmit: (d: ReviewData) => Promise<void> | void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [flags, setFlags] = useState({ arrivedOnTime: true, pleasantCommunication: true, meetingHappened: true, wouldMeetAgain: true });
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (open) {
      setRating(0);
      setFlags({ arrivedOnTime: true, pleasantCommunication: true, meetingHappened: true, wouldMeetAgain: true });
    }
  }, [open, personName]);

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="t">
        Как прошла встреча <em>с {personName}?</em>
      </h2>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            className={i <= rating ? "on" : ""}
            onClick={(e) => {
              setRating(i);
              Array.from(e.currentTarget.parentElement?.children ?? [])
                .slice(0, i)
                .forEach((b, k) =>
                  b.animate([{ transform: "scale(.6)" }, { transform: "scale(1.25)" }, { transform: "none" }], {
                    duration: 380,
                    delay: k * 50,
                    easing: "cubic-bezier(.34,1.56,.64,1)",
                  })
                );
            }}
            aria-label={`${i} звёзд`}
          >
            ★
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {TOGGLES.map(([k, t]) => (
          <button key={k} className="opt gl" onClick={() => setFlags((f) => ({ ...f, [k]: !f[k] }))} role="switch" aria-checked={flags[k]}>
            <b>{t}</b>
            <span className={`sw-t ${flags[k] ? "on" : ""}`} />
          </button>
        ))}
      </div>
      <button
        className="btn v"
        disabled={!rating || sending}
        onClick={async () => {
          setSending(true);
          try {
            await onSubmit({ rating, ...flags });
          } finally {
            setSending(false);
          }
        }}
      >
        {sending ? "Отправляем…" : "Отправить"}
      </button>
      <button className="btn o" onClick={onClose}>
        Отмена
      </button>
    </Sheet>
  );
}
