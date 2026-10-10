"use client";

import { useEffect, useRef, useState } from "react";
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

  function paint() {
    const w = ref.current;
    if (!w) return;
    const st = w.scrollTop;
    [...w.children].forEach((node, i) => {
      const el = node as HTMLElement;
      const d = (i * 40 - st) / 40;
      if (Math.abs(d) > 5) {
        el.style.opacity = "0";
        return;
      }
      el.style.transform = `rotateX(${-d * 21}deg)`;
      el.style.opacity = String(Math.max(0.12, 1 - Math.abs(d) * 0.3));
      el.classList.toggle("cur", Math.abs(d) < 0.5);
    });
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
