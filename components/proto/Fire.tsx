"use client";

import { useEffect, useState, type MouseEvent } from "react";

/** «Огонёк» — значок для счётчика на карточке и кнопки на экране события. */
export function FireIcon({ size = 18, off = false }: { size?: number; off?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id="k-fire-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF4D12" />
          <stop offset=".6" stopColor="#FF8A1F" />
          <stop offset="1" stopColor="#FFC93C" />
        </linearGradient>
      </defs>
      <path
        fill={off ? "none" : "url(#k-fire-g)"}
        stroke={off ? "currentColor" : "none"}
        strokeWidth={off ? 1.7 : 0}
        strokeLinejoin="round"
        d="M12 2.2c.6 3.1 2.6 4.9 4.3 6.8 1.6 1.8 2.9 3.8 2.9 6.4A7.2 7.2 0 0 1 12 22.6a7.2 7.2 0 0 1-7.2-7.2c0-2.3 1-4.2 2.4-5.6.3 1.6 1.1 2.7 2.3 3.3-.4-3.9 1-7.7 2.5-10.9z"
      />
      {off ? null : <path fill="#FFE7A3" d="M12 13.2c.4 1.5 1.6 2.4 2.2 3.6.5 1 .5 2.1.1 3a3.1 3.1 0 0 1-4.7 1.1 3 3 0 0 1-1-3.3c.4-1.5 2.4-2.6 3.4-4.4z" />}
    </svg>
  );
}

/**
 * Плашка огонька на карточке события: видна всегда, нажимается прямо в ленте
 * (карточку при этом не открывает). Число — когда огоньки уже есть.
 */
export function FireChip({ id, count, mine }: { id: string; count: number; mine: boolean }) {
  const [st, setSt] = useState({ count, mine, pop: false });
  useEffect(() => setSt({ count, mine, pop: false }), [count, mine]);
  const tap = (ev: MouseEvent<HTMLSpanElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    const on = !st.mine;
    try {
      (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (s: string) => void } } } }).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(on ? "medium" : "light");
    } catch {
      /* нет вибро */
    }
    setSt({ count: Math.max(0, st.count + (on ? 1 : -1)), mine: on, pop: on });
    fetch(`/api/events/${id}/fire`, { method: on ? "POST" : "DELETE" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number; fired?: boolean } | null) => {
        if (d && typeof d.count === "number") setSt((s) => ({ ...s, count: d.count!, mine: !!d.fired }));
      })
      .catch(() => {});
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={`k-fc${st.mine ? " on" : ""}${st.pop ? " pop" : ""}${st.count > 0 ? "" : " k-fc0"}`}
      onClick={tap}
      aria-pressed={st.mine}
      aria-label={st.mine ? "Убрать огонёк" : "Поставить огонёк"}
    >
      <FireIcon size={15} off={!st.mine} />
      {st.count > 0 ? st.count : null}
    </span>
  );
}
