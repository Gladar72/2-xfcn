"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createFireStore } from "./fire-state";
import { say } from "@/lib/mosya/peek";

const store = createFireStore(async (id, mine) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`/api/events/${id}/fire`, { method: mine ? "POST" : "DELETE", signal: controller.signal });
    if (!response.ok) throw new Error("fire_unavailable");
    const data = await response.json();
    if (!Number.isFinite(data.count) || data.count < 0 || typeof data.fired !== "boolean") throw new Error("invalid_fire");
    return { count: data.count, mine: data.fired };
  } finally { clearTimeout(timer); }
}, () => say("Не удалось сохранить огонёк. Попробуй ещё раз."));

export function observeEventFire(event: { id: string; fireCount?: number; myFire?: boolean }, requestedAt: number) {
  store.observe(event.id, { count: event.fireCount ?? 0, mine: !!event.myFire }, requestedAt);
}

export function useEventFire(id: string, count = 0, mine = false) {
  const initial = useMemo(() => ({ count, mine, pending: false }), [count, mine]);
  const subscribe = useCallback((fn: () => void) => store.subscribe(id, fn), [id]);
  const getSnapshot = useCallback(() => store.get(id) ?? initial, [id, initial]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => initial);
  const toggle = () => {
    try {
      (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void } } } }).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(value.mine ? "light" : "medium");
    } catch { /* Webviews without haptics. */ }
    store.toggle(id, initial);
  };
  return { ...value, pop: value.pending && value.mine, toggle };
}
