"use client";

import { useEffect, type RefObject } from "react";

/** Short conversations respond to a pan even when there is no history to scroll.
 * Long conversations keep the browser's native scrolling and momentum. */
export function useChatElasticScroll(
  listRef: RefObject<HTMLDivElement>,
  contentRef: RefObject<HTMLDivElement>,
  enabled: boolean,
) {
  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!enabled || !list || !content) return;

    let gesture: { id: number; x: number; y: number; base: number } | null = null;
    let animation: Animation | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let wheelDistance = 0;
    let handlesShortHistory = false;
    const padding = () => {
      const style = getComputedStyle(list);
      return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    };
    const short = () => content.offsetHeight + padding() <= list.clientHeight + 1;
    const resistance = (distance: number) => distance * 0.35 / (1 + Math.abs(distance) / 180);
    const paint = (offset: number) => { list.style.transform = `translate3d(0, ${Math.max(-72, Math.min(72, offset))}px, 0)`; };
    const stopAnimation = () => {
      const transform = getComputedStyle(list).transform;
      const offset = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      animation?.cancel();
      animation = null;
      return offset;
    };
    const reset = () => {
      clearTimeout(wheelTimer);
      wheelDistance = 0;
      gesture = null;
      animation?.cancel();
      animation = null;
      list.style.removeProperty("transform");
    };
    const settle = () => {
      const offset = stopAnimation();
      list.style.removeProperty("transform");
      if (Math.abs(offset) < 0.5 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      animation = list.animate([
        { transform: `translate3d(0, ${offset}px, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    };
    const start = (event: TouchEvent) => {
      clearTimeout(wheelTimer);
      wheelDistance = 0;
      if (event.touches.length !== 1 || !short()) { reset(); return; }
      const touch = event.touches[0]!;
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, base: stopAnimation() };
      paint(gesture.base);
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0]!;
      if (touch.identifier !== gesture.id) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { reset(); return; }
      // Only consume a vertical pan that cannot scroll any history. Pinch zoom,
      // taps and every gesture in a long conversation retain their native path.
      if (event.cancelable) event.preventDefault();
      paint(gesture.base + resistance(dy));
    };
    const end = () => { if (gesture) { gesture = null; settle(); } };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !short()) return;
      if (event.cancelable) event.preventDefault();
      stopAnimation();
      clearTimeout(wheelTimer);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1;
      wheelDistance = Math.max(-600, Math.min(600, wheelDistance - event.deltaY * unit));
      paint(resistance(wheelDistance));
      wheelTimer = setTimeout(() => { wheelDistance = 0; settle(); }, 100);
    };

    // Move the scroller inside its clipped frame, not its content: scrollHeight
    // and message anchors stay unchanged throughout the elastic gesture.
    const updateGeometry = () => {
      reset();
      const needed = short();
      if (needed === handlesShortHistory) return;
      handlesShortHistory = needed;
      if (needed) {
        list.addEventListener("touchmove", move, { passive: false });
        list.addEventListener("wheel", wheel, { passive: false });
      } else {
        list.removeEventListener("touchmove", move);
        list.removeEventListener("wheel", wheel);
      }
    };
    list.addEventListener("touchstart", start, { passive: true });
    list.addEventListener("touchend", end, { passive: true });
    list.addEventListener("touchcancel", reset, { passive: true });
    // Non-passive handlers exist only while there is no scrollable history.
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(list);
    observer.observe(content);
    updateGeometry();
    return () => {
      observer.disconnect();
      list.removeEventListener("touchstart", start);
      list.removeEventListener("touchmove", move);
      list.removeEventListener("touchend", end);
      list.removeEventListener("touchcancel", reset);
      list.removeEventListener("wheel", wheel);
      reset();
    };
  }, [listRef, contentRef, enabled]);
}
