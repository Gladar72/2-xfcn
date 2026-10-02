"use client";

/**
 * Дата рождения тремя списками «день / месяц / год» вместо системного
 * календаря: на Android нативный <input type="date"> открывается на текущем
 * месяце, и до года рождения приходится листать сотни месяцев.
 * Значение — строка YYYY-MM-DD (пустая, пока не выбраны все три части).
 */
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function daysIn(year: number, month: number): number {
  return new Date(year || 2000, month, 0).getDate();
}

export function BirthDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m, d] = value ? value.split("-").map(Number) : [0, 0, 0];
  const nowYear = new Date().getFullYear();
  const years = Array.from({ length: 83 }, (_, i) => nowYear - 18 - i); // 18–100 лет
  const maxDay = m ? daysIn(y ?? 0, m) : 31;

  // Пока выбраны не все части, храним их в value через «нулевые» места.
  function update(next: { y?: number; m?: number; d?: number }) {
    const ny = next.y ?? y ?? 0;
    const nm = next.m ?? m ?? 0;
    let nd = next.d ?? d ?? 0;
    if (nm && nd > daysIn(ny, nm)) nd = daysIn(ny, nm);
    const pad = (n: number, l: number) => String(n).padStart(l, "0");
    onChange(ny || nm || nd ? `${pad(ny, 4)}-${pad(nm, 2)}-${pad(nd, 2)}` : "");
  }

  const cls =
    "w-full min-w-0 appearance-none rounded-card border border-ink-400/20 bg-white px-3 py-4 text-center text-base text-ink-900 outline-none focus:border-accent";

  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
      <select aria-label="День" value={d || ""} onChange={(e) => update({ d: Number(e.target.value) })} className={cls}>
        <option value="" disabled>День</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <select aria-label="Месяц" value={m || ""} onChange={(e) => update({ m: Number(e.target.value) })} className={cls}>
        <option value="" disabled>Месяц</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>
      <select aria-label="Год" value={y || ""} onChange={(e) => update({ y: Number(e.target.value) })} className={cls}>
        <option value="" disabled>Год</option>
        {years.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );
}

/** Полностью ли выбрана дата (все три части). */
export function isCompleteBirthDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith("0000") && !v.includes("-00");
}
