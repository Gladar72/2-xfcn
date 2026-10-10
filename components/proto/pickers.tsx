"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ic, Sheet } from "./ui";

/**
 * Колесо выбора «как будильник на айфоне» (wheels прототипа): прокрутка
 * с прилипанием, строки поворачиваются rotateX, текущая — фиолетовая.
 */
export function Wheel({
  items,
  index,
  onChange,
  cls = "",
}: {
  items: string[];
  index: number;
  onChange: (i: number) => void;
  cls?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cur = useRef(index);

  // Рисуем только строки рядом с центром: в длинных списках (города — сотни
  // строк) пересчёт всех строк на каждый кадр прокрутки давал подтормаживание.
  const painted = useRef<Set<number>>(new Set());
  function paint() {
    const w = ref.current;
    if (!w) return;
    const st = w.scrollTop;
    const kids = w.children;
    const c = Math.round(st / 40);
    const next = new Set<number>();
    for (let i = Math.max(0, c - 6); i <= Math.min(kids.length - 1, c + 6); i++) {
      const el = kids[i] as HTMLElement;
      const d = (i * 40 - st) / 40;
      next.add(i);
      el.style.transform = `rotateX(${-d * 21}deg)`;
      el.style.opacity = Math.abs(d) > 5 ? "0" : String(Math.max(0.12, 1 - Math.abs(d) * 0.3));
      el.classList.toggle("cur", Math.abs(d) < 0.5);
    }
    painted.current.forEach((i) => {
      if (!next.has(i) && kids[i]) {
        (kids[i] as HTMLElement).style.opacity = "0";
        kids[i]!.classList.remove("cur");
      }
    });
    painted.current = next;
  }

  // внешняя смена (быстрые чипсы «Завтра», календарь) — докручиваем колесо
  useEffect(() => {
    const w = ref.current;
    if (!w) return;
    if (cur.current !== index || Math.round(w.scrollTop / 40) !== index) {
      cur.current = index;
      w.scrollTo({ top: index * 40, behavior: w.scrollTop === 0 && index > 0 ? "auto" : "smooth" });
    }
    requestAnimationFrame(paint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div
      ref={ref}
      className={`wh ${cls}`}
      onScroll={() => {
        requestAnimationFrame(paint);
        const w = ref.current;
        if (!w) return;
        const ix = Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / 40)));
        if (ix !== cur.current) {
          cur.current = ix;
          onChange(ix);
        }
      }}
    >
      {items.map((t, i) => (
        <div key={i} onClick={() => ref.current?.scrollTo({ top: i * 40, behavior: "smooth" })}>
          {t}
        </div>
      ))}
    </div>
  );
}

const MN = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

/** Календарь-шторка (calSheet прототипа). dayIndex — смещение от сегодня. */
export function CalendarSheet({
  open,
  onClose,
  dayIndex,
  maxDays,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  dayIndex: number;
  maxDays: number;
  onPick: (i: number) => void;
}) {
  const [m, setM] = useState(0);
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const sel = new Date(base.getTime() + dayIndex * 864e5);
  useEffect(() => {
    if (open) setM((sel.getFullYear() - base.getFullYear()) * 12 + sel.getMonth() - base.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const y = base.getFullYear() + Math.floor((base.getMonth() + m) / 12);
  const mo = (base.getMonth() + m) % 12;
  const first = new Date(y, mo, 1);
  const off = (first.getDay() + 6) % 7;
  const n = new Date(y, mo + 1, 0).getDate();
  const lastM = Math.floor((maxDays - 1) / 30);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="calh">
        <button className="rb gl" disabled={m <= 0} style={m <= 0 ? { opacity: 0.3 } : undefined} onClick={() => setM(m - 1)} aria-label="Прошлый месяц">
          <Ic n="back" c="s" />
        </button>
        <b>
          {MN[mo]} {y}
        </b>
        <button className="rb gl" disabled={m >= lastM} style={m >= lastM ? { opacity: 0.3 } : undefined} onClick={() => setM(m + 1)} aria-label="Следующий месяц">
          <Ic n="chev" c="s" />
        </button>
      </div>
      <div className="calg">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <i key={d}>{d}</i>
        ))}
        {Array.from({ length: off }, (_, k) => (
          <span key={"o" + k} />
        ))}
        {Array.from({ length: n }, (_, k) => {
          const dt = new Date(y, mo, k + 1);
          const idx = Math.round((dt.getTime() - base.getTime()) / 864e5);
          const dis = idx < 0 || idx >= maxDays;
          const on = dt.getTime() === sel.getTime();
          return (
            <button key={k} className={`${on ? "on" : ""} ${idx === 0 ? "today" : ""}`} disabled={dis} onClick={() => onPick(idx)}>
              {k + 1}
            </button>
          );
        })}
      </div>
      <button className="btn k" onClick={onClose}>
        Готово
      </button>
    </Sheet>
  );
}


/**
 * Выбор города колесом, как на iPhone: крутишь — город в рамке выбран.
 * Сверху поиск: начни вводить — колесо сузится до подходящих городов.
 * Клавиатура сама не открывается (раньше из‑за неё шторка прыгала и тормозила).
 */
export function CityWheel({ value, cities, onPick, cta = "Выбрать" }: { value: string; cities: string[]; onPick: (c: string) => void; cta?: string }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return cities;
    const starts = cities.filter((c) => c.toLowerCase().startsWith(t));
    const has = cities.filter((c) => !c.toLowerCase().startsWith(t) && c.toLowerCase().includes(t));
    return [...starts, ...has];
  }, [q, cities]);
  const [ix, setIx] = useState(() => Math.max(0, cities.indexOf(value)));
  useEffect(() => {
    if (q) setIx(0);
  }, [q]);
  const safeIx = Math.min(ix, Math.max(0, list.length - 1));
  return (
    <>
      <label className="field gl" style={{ marginTop: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти город" enterKeyHint="search" />
      </label>
      {list.length ? (
        <div className="wheels gl">
          <Wheel key={q} items={list} index={safeIx} onChange={setIx} cls="d city" />
        </div>
      ) : (
        <p className="muted" style={{ textAlign: "center", margin: "28px 0" }}>
          Такого города пока нет в списке
        </p>
      )}
      <button className="btn v" disabled={!list.length} onClick={() => list[safeIx] && onPick(list[safeIx]!)} style={{ marginTop: 12 }}>
        {cta}
        {list[safeIx] ? ` · ${list[safeIx]}` : ""}
      </button>
    </>
  );
}
