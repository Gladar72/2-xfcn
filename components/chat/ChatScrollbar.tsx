"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

type Metrics = { range: number; top: number; height: number; travel: number; value: number };
const INSET = 8;
const geometry = (list: HTMLElement): Metrics => {
  const range = Math.max(0, list.scrollHeight - list.clientHeight);
  const track = Math.max(0, list.clientHeight - INSET * 2);
  const height = Math.min(track, Math.max(48, track * list.clientHeight / Math.max(1, list.scrollHeight)));
  const travel = track - height;
  const value = Math.max(0, Math.min(range, list.scrollTop));
  return { range, height, travel, value, top: range ? value / range * travel : 0 };
};

/** A touch-sized handle for fast navigation; the message list retains native momentum scrolling. */
export function ChatScrollbar({ listRef, contentRef, onNavigate, enabled }: {
  listRef: RefObject<HTMLDivElement>;
  contentRef: RefObject<HTMLDivElement>;
  onNavigate: () => void;
  enabled: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; grab: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>({ range: 0, top: 0, height: 48, travel: 0, value: 0 });
  const update = useCallback(() => {
    const list = listRef.current;
    if (list) setMetrics(geometry(list));
  }, [listRef]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    update();
    list.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    observer.observe(content);
    return () => {
      list.removeEventListener("scroll", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [contentRef, listRef, update, enabled]);

  function seek(top: number) {
    const list = listRef.current;
    if (!list) return;
    onNavigate();
    list.scrollTo({ top, behavior: "auto" });
    update();
  }

  return <div className="chat-scrollbar" ref={trackRef} hidden={!enabled || metrics.range < 1}>
    <div
      className={`chat-scroll-thumb${dragging ? " dragging" : ""}`}
      role="scrollbar" aria-label="Прокрутка переписки" aria-controls="chat-messages"
      aria-orientation="vertical" aria-valuemin={0}
      aria-valuemax={Math.round(metrics.range)} aria-valuenow={Math.round(metrics.value)}
      tabIndex={0}
      style={{ height: metrics.height, transform: `translateY(${metrics.top}px)` }}
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current) return;
        e.preventDefault();
        e.stopPropagation();
        onNavigate();
        const box = e.currentTarget.getBoundingClientRect();
        drag.current = { pointer: e.pointerId, grab: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)) };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (drag.current?.pointer !== e.pointerId || !listRef.current || !trackRef.current) return;
        const current = geometry(listRef.current);
        const y = e.clientY - trackRef.current.getBoundingClientRect().top - drag.current.grab * current.height;
        const fraction = current.travel ? Math.max(0, Math.min(1, y / current.travel)) : 0;
        seek(fraction * current.range);
      }}
      onPointerUp={(e) => {
        if (drag.current?.pointer !== e.pointerId) return;
        drag.current = null;
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onKeyDown={(e) => {
        const list = listRef.current;
        if (!list) return;
        const step = list.clientHeight * 0.85;
        const destinations: Record<string, number> = {
          Home: 0, End: list.scrollHeight, ArrowUp: list.scrollTop - 80,
          ArrowDown: list.scrollTop + 80, PageUp: list.scrollTop - step, PageDown: list.scrollTop + step,
        };
        const top = destinations[e.key];
        if (top === undefined) return;
        e.preventDefault();
        seek(top);
      }}
    />
  </div>;
}
