"use client";

import { useEffect, useState } from "react";

/**
 * Анимации брендбука 2026, как в прототипе:
 *  — нажатие: кнопка мягко «проседает»; фотографии при прокрутке не сжимаются;
 *  — «Сердечко отправлено»: карточка по центру экрана, сама исчезает
 *    (вызывается событием window "mesto:heartpop").
 * Один обработчик на весь документ — ничего не добавляет в сами экраны.
 */
const PRESS = ".k-pr, .P .btn, .P .rb, .P .chip, .P .cat, .P .row, .P .ci, .P .mcard, .P .nav26 .ntab";
const PHOTO_CARD = ".k-mt, .k-hc, .pcard, .row.gl, .k-afr";

export function Motion26() {
  const [heart, setHeart] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Нажатие показываем с задержкой и отменяем, если палец поехал (листание) —
    // при прокрутке карточки не «проседают».
    let pend: { el: HTMLElement; x: number; y: number; t: number } | null = null;
    const up = () => {
      if (!pend) return;
      window.clearTimeout(pend.t);
      pend.el.classList.remove("k-down");
      pend = null;
    };
    const move = (e: PointerEvent) => {
      if (!pend) return;
      if (Math.abs(e.clientX - pend.x) > 6 || Math.abs(e.clientY - pend.y) > 6) {
        up();
      }
    };
    const down = (e: PointerEvent) => {
      up();
      const t = e.target as Element | null;
      const el = t?.closest?.(PRESS) as HTMLElement | null;
      if (!el || reduce || el.matches(PHOTO_CARD) || (el as HTMLButtonElement).disabled) return;
      pend = { el, x: e.clientX, y: e.clientY, t: window.setTimeout(() => el.classList.add("k-down"), 90) };
    };
    const pop = () => setHeart((n) => n + 1);
    document.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", up, { passive: true });
    document.addEventListener("pointercancel", up, { passive: true });
    window.addEventListener("scroll", up, { passive: true, capture: true });
    window.addEventListener("mesto:heartpop", pop);
    return () => {
      up();
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      window.removeEventListener("scroll", up, { capture: true });
      window.removeEventListener("mesto:heartpop", pop);
    };
  }, []);

  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!heart) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 1900);
    return () => window.clearTimeout(t);
  }, [heart]);

  return (
    <div className="K" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 600 }} aria-live="polite">
      <div className={`k-hpop k-g ${show ? "k-show" : ""}`} style={{ position: "fixed" }}>
        <span className="k-hh">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
          </svg>
        </span>
        {show && (
          <>
            <b>Сердечко отправлено</b>
            <span>Будет взаимно — подберём вам встречу</span>
          </>
        )}
      </div>
    </div>
  );
}
