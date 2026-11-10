"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "./ui";

export interface ReviewData {
  rating: number;
  arrivedOnTime: boolean;
  pleasantCommunication: boolean;
  meetingHappened: boolean;
  wouldMeetAgain: boolean;
}

const TOGGLES: [keyof Omit<ReviewData, "rating">, string][] = [
  ["meetingHappened", "Встреча состоялась"],
  ["arrivedOnTime", "Всё началось вовремя"],
  ["pleasantCommunication", "Приятная атмосфера"],
  ["wouldMeetAgain", "Пошёл(-ла) бы снова"],
];

/** «Как прошла встреча «…»?» — оценка события целиком: звёзды + 4 переключателя. */
export function ReviewSheet({
  open,
  personName,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** Название встречи — оцениваем событие, а не человека. */
  personName: string;
  onSubmit: (d: ReviewData) => Promise<void> | void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [flags, setFlags] = useState({ arrivedOnTime: true, pleasantCommunication: true, meetingHappened: true, wouldMeetAgain: true });
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setRating(0);
      setError("");
      setFlags({ arrivedOnTime: true, pleasantCommunication: true, meetingHappened: true, wouldMeetAgain: true });
    }
  }, [open, personName]);

  return (
    <Sheet open={open} onClose={() => { if (!sendingRef.current) onClose(); }}>
      <h2 className="t">
        Как прошла встреча <em>«{personName}»?</em>
      </h2>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            className={i <= rating ? "on" : ""}
            disabled={sending}
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
          <button key={k} className="opt gl" disabled={sending} onClick={() => setFlags((f) => ({ ...f, [k]: !f[k] }))} role="switch" aria-checked={flags[k]}>
            <b>{t}</b>
            <span className={`sw-t ${flags[k] ? "on" : ""}`} />
          </button>
        ))}
      </div>
      {error && <p role="alert" className="muted">{error}</p>}
      <button
        className="btn v"
        disabled={!rating || sending}
        onClick={async () => {
          if (sendingRef.current || !rating) return;
          sendingRef.current = true;
          setSending(true);
          setError("");
          try {
            await onSubmit({ rating, ...flags });
          } catch {
            setError("Не удалось отправить отзыв. Оценка сохранена в форме — попробуй ещё раз.");
          } finally {
            sendingRef.current = false;
            setSending(false);
          }
        }}
      >
        {sending ? "Отправляем…" : "Отправить"}
      </button>
      <button className="btn o" disabled={sending} onClick={onClose}>
        Отмена
      </button>
    </Sheet>
  );
}
