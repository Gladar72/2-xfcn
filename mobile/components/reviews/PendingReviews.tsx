import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useSegments } from "expo-router";
import { ReviewSheet } from "@/components/reviews/ReviewSheet";
import { fetchReviewable, isReviewed, toTargets, type ReviewTarget } from "@/lib/reviews";

// Кого человек пропустил «Отменой» — до перезапуска приложения не спрашиваем снова.
const skipped = new Set<string>();
const keyOf = (t: ReviewTarget) => `${t.eventId}:${t.person.id}`;
const MIN_GAP_MS = 5 * 60 * 1000;

/**
 * Как PendingReviewModal в мини-приложении: при входе (и при возвращении в
 * приложение) предлагаем оценить участников прошедших встреч — по одному.
 * Показываем только поверх вкладок, чтобы не мешать на других экранах.
 */
export function PendingReviews() {
  const segments = useSegments();
  const onTabs = segments[0] === "(tabs)";
  const [queue, setQueue] = useState<ReviewTarget[]>([]);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
    lastCheck.current = Date.now();
    try {
      const targets = toTargets(await fetchReviewable()).filter((t) => !skipped.has(keyOf(t)));
      if (targets.length) setQueue(targets);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(check, 1500);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [check]);

  // Уже оценённых на других экранах пропускаем.
  const pending = queue.filter((t) => !isReviewed(t));

  return (
    <ReviewSheet
      target={onTabs ? pending[0] ?? null : null}
      onDone={(t) => setQueue((q) => q.filter((x) => keyOf(x) !== keyOf(t)))}
      onSkip={(t) => {
        skipped.add(keyOf(t));
        setQueue((q) => q.filter((x) => keyOf(x) !== keyOf(t)));
      }}
    />
  );
}
