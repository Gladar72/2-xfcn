"use client";

import { useEffect } from "react";

/**
 * Переходы между экранами как в прототипе (go / back / root / modal / closeTop):
 *  • вперёд — новый экран въезжает справа (.in), старый уходит под него (.under);
 *  • назад — текущий уезжает вправо (.out), предыдущий выезжает из-под (.back-in);
 *  • вкладки нижнего меню — мягкая смена (.fade);
 *  • экраны-«модалки» (создание, «Опубликовано», «Заявка отправлена») — снизу
 *    вверх (.up) и обратно вниз (.down).
 *
 * В Next старый экран размонтируется сразу, поэтому снятый React-ом узел
 * <section class="scr"> мы на долю секунды возвращаем как «призрак» и
 * доигрываем на нём уход — сам React его уже не трогает.
 */
const TAB_PATHS = new Set(["/feed", "/map", "/my-events", "/profile"]);
const MODAL_IDS = new Set(["create", "published", "done"]);
const ANIMS = ["in", "fade", "up", "back-in", "under", "out", "down"];

type Sec = HTMLElement & { _href?: string; _st?: number };

const hrefNow = () => location.pathname + location.search;
const isTabHref = (h: string) => {
  const [p = "", q = ""] = h.split("?");
  return TAB_PATHS.has(p) && !(p === "/feed" && /(^|&)category=/.test(q));
};
const setAnim = (el: HTMLElement, a: string | null) => {
  el.classList.remove(...ANIMS);
  if (a) {
    void el.offsetWidth;
    el.classList.add(a);
  }
};

function sectionsIn(n: Node): Sec[] {
  if (!(n instanceof HTMLElement)) return [];
  if (n.matches("section.scr")) return [n as Sec];
  return Array.from(n.querySelectorAll<Sec>("section.scr"));
}

export function ScreenTransitions() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let backAt = 0;
    const onPop = () => (backAt = Date.now());
    window.addEventListener("popstate", onPop);
    // Переход вперёд (push/replace) отменяет отметку «назад».
    const H = window.history;
    const push0 = H.pushState;
    const repl0 = H.replaceState;
    H.pushState = function (...a: Parameters<History["pushState"]>) {
      backAt = 0;
      return push0.apply(this, a);
    };
    H.replaceState = function (...a: Parameters<History["replaceState"]>) {
      return repl0.apply(this, a);
    };

    // Запоминаем прокрутку экрана — у вернувшегося «призрака» она сбрасывается.
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!(t instanceof HTMLElement) || !t.classList.contains("scroll")) return;
      const s = t.closest("section.scr") as Sec | null;
      if (s) s._st = t.scrollTop;
    };
    document.addEventListener("scroll", onScroll, true);

    document.querySelectorAll<Sec>("section.scr").forEach((s) => (s._href = hrefNow()));

    const ghost = (old: Sec, anchor: Sec, cls: string | null, above: boolean, ms: number) => {
      const root = anchor.closest(".P");
      if (!root) return;
      old.classList.add("ghost");
      old.setAttribute("aria-hidden", "true");
      old.setAttribute("inert", "");
      setAnim(old, null);
      if (above) anchor.after(old);
      else anchor.before(old);
      const sc = old.querySelector<HTMLElement>(".scroll");
      if (sc && old._st) sc.scrollTop = old._st;
      if (cls) setAnim(old, cls);
      setTimeout(() => old.remove(), ms);
    };

    const mo = new MutationObserver((recs) => {
      const removed: Sec[] = [];
      const added: Sec[] = [];
      for (const r of recs) {
        r.removedNodes.forEach((n) => removed.push(...sectionsIn(n).filter((s) => !s.classList.contains("ghost"))));
        r.addedNodes.forEach((n) => added.push(...sectionsIn(n).filter((s) => !s.classList.contains("ghost") && !s._href)));
      }
      if (!removed.length && !added.length) return;
      const now = hrefNow();
      added.forEach((s) => (s._href = now));
      const gone = removed.filter((s) => !s.isConnected);
      const fresh = added.filter((s) => s.isConnected);

      // Закрылась модалка поверх того же экрана («Заявка отправлена» и т.п.).
      if (!fresh.length) {
        for (const g of gone) {
          if (!MODAL_IDS.has(g.dataset.id ?? "")) continue;
          const under = document.querySelector<Sec>(".P section.scr:not(.ghost)");
          if (under) ghost(g, under, "down", true, 440);
        }
        return;
      }

      const nu = fresh[fresh.length - 1];
      if (!nu) return;
      const old = gone.find((g) => g._href !== now);

      if (!old) {
        // Тот же адрес: заглушка загрузки сменилась экраном — без повторного въезда.
        const same = gone.find((g) => g._href === now);
        if (same && !MODAL_IDS.has(nu.dataset.id ?? "")) setAnim(nu, "fade");
        return;
      }

      const back = Date.now() - backAt < 1200;
      backAt = 0;
      const oldModal = MODAL_IDS.has(old.dataset.id ?? "");
      const nuModal = MODAL_IDS.has(nu.dataset.id ?? "");

      if (nu.dataset.id === "splash") return;
      if (back || (oldModal && !nuModal)) {
        setAnim(nu, oldModal ? null : "back-in");
        ghost(old, nu, oldModal ? "down" : "out", true, 440);
      } else if (nuModal) {
        setAnim(nu, "up");
        ghost(old, nu, null, false, 560);
      } else if (isTabHref(now)) {
        setAnim(nu, "fade");
        ghost(old, nu, null, false, 380);
      } else {
        setAnim(nu, "in");
        ghost(old, nu, "under", false, 500);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      window.removeEventListener("popstate", onPop);
      H.pushState = push0;
      H.replaceState = repl0;
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);
  return null;
}
