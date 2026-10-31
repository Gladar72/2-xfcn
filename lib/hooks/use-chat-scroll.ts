"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Message = { id: string; senderId: string; createdAt: string };
type Anchor = { element: HTMLElement; offset: number };
const BOTTOM_THRESHOLD = 48;

/** One scroll owner. Keep either the latest message or the reader's visible row anchored. */
export function useChatScroll(messages: Message[], userId: string | null, ready: boolean) {
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const initializedRef = useRef(false);
  const smoothRef = useRef(false);
  const anchorRef = useRef<Anchor | null>(null);
  const previousRef = useRef<Message[]>([]);
  const preserveRef = useRef(false);
  const geometryRef = useRef({ height: 0, viewport: 0 });
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);

  const captureAnchor = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    geometryRef.current = { height: list.scrollHeight, viewport: list.clientHeight };
    const top = list.getBoundingClientRect().top;
    const rows = list.querySelectorAll<HTMLElement>("[data-message-id] .m");
    // Choose a row intersecting the viewport, not a loader or a changing date label.
    const row = Array.from(rows).find((el) => el.getBoundingClientRect().bottom > top);
    anchorRef.current = row ? { element: row, offset: row.getBoundingClientRect().top - top } : null;
  }, []);

  const restoreAnchor = useCallback(() => {
    const list = listRef.current;
    const anchor = anchorRef.current;
    if (!list || !anchor || !list.contains(anchor.element)) return;
    const delta = anchor.element.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset;
    if (Math.abs(delta) > 0.5) list.scrollTop += delta;
  }, []);

  const followOutput = useCallback(() => {
    followingRef.current = true;
    setAtBottom(true);
    setUnseen(0);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const list = listRef.current;
    if (!list) return;
    followOutput();
    const animate = smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    smoothRef.current = animate;
    list.scrollTo({ top: list.scrollHeight - list.clientHeight, behavior: animate ? "smooth" : "auto" });
    captureAnchor();
  }, [captureAnchor, followOutput]);

  const preservePosition = useCallback(() => {
    captureAnchor();
    preserveRef.current = true;
  }, [captureAnchor]);

  // Stop a programmatic animation as soon as the reader starts another gesture.
  // Never preventDefault: vertical panning and momentum belong to the browser.
  const interruptScroll = useCallback(() => {
    const list = listRef.current;
    if (list && smoothRef.current) list.scrollTo({ top: list.scrollTop, behavior: "auto" });
    smoothRef.current = false;
    captureAnchor();
  }, [captureAnchor]);

  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    // A resized viewport can dispatch scroll before ResizeObserver (notably
    // when the keyboard/composer changes). Keep the previous follow intent
    // until the observer has reconciled that layout.
    const geometry = geometryRef.current;
    if (geometry.height !== list.scrollHeight || geometry.viewport !== list.clientHeight) return;
    const distance = Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop);
    if (smoothRef.current && distance > 1) return;
    smoothRef.current = false;
    followingRef.current = distance <= BOTTOM_THRESHOLD;
    setAtBottom(followingRef.current);
    if (followingRef.current) setUnseen(0);
    captureAnchor();
  }, [captureAnchor]);

  const reconcileLayout = useCallback(() => {
    const list = listRef.current;
    if (!list || !initializedRef.current) return;
    if (followingRef.current && !preserveRef.current) {
      smoothRef.current = false;
      list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
    } else {
      restoreAnchor();
    }
    preserveRef.current = false;
    captureAnchor();
  }, [captureAnchor, restoreAnchor]);

  useLayoutEffect(() => {
    if (!ready || !listRef.current) return;
    const previous = previousRef.current;
    if (!initializedRef.current) {
      initializedRef.current = true;
      scrollToBottom();
    } else if (messages !== previous) {
      const ids = new Set(previous.map((m) => m.id));
      const newest = previous.at(-1)?.createdAt;
      const incoming = messages.filter((m) =>
        !ids.has(m.id) && m.senderId !== userId && (!newest || m.createdAt >= newest)
      ).length;
      if (incoming && !followingRef.current) setUnseen((n) => n + incoming);
    }
    previousRef.current = messages;
    reconcileLayout();
  }, [messages, userId, ready, reconcileLayout, scrollToBottom]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content) return;
    // Covers keyboard/composer changes, decoded photos and late-loading fonts.
    // Observe the content too: changing scrollHeight does not resize the scroller.
    const observer = new ResizeObserver(reconcileLayout);
    observer.observe(list);
    observer.observe(content);
    return () => observer.disconnect();
  }, [reconcileLayout]);

  return { listRef, contentRef, atBottom, unseen, handleScroll, interruptScroll, scrollToBottom, followOutput, preservePosition };
}
