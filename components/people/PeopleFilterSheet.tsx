"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Ic, Sheet } from "@/components/proto/ui";
import { groupInterests, interestIcon } from "@/lib/data/interests";
import { DEFAULT_PEOPLE_FILTERS, readPeopleFilters, type PeopleFilters } from "@/lib/people/filters";

interface Interest { id: string; name: string }
const PREVIEW = ["Кофе", "Кино", "Бег", "Путешествия", "Музыка", "Йога"];

export function PeopleFilterSheet({ open, value, onClose, onApply }: {
  open: boolean; value: PeopleFilters; onClose: () => void; onApply: (filters: PeopleFilters) => void;
}) {
  const [gender, setGender] = useState(value.gender);
  const [low, setLow] = useState(String(value.ageMin));
  const [high, setHigh] = useState(String(value.ageMax));
  const [selected, setSelected] = useState(value.interests);
  const [catalog, setCatalog] = useState(false);
  const [search, setSearch] = useState("");
  const [all, setAll] = useState<Interest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    setGender(value.gender); setLow(String(value.ageMin)); setHigh(String(value.ageMax)); setSelected(value.interests);
    setCatalog(false); setSearch("");
  }, [open, value]);
  useEffect(() => {
    if (!open || all !== null) return;
    const controller = new AbortController();
    setFailed(false);
    fetch("/api/interests", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("interests_unavailable");
      const data = await r.json();
      if (!Array.isArray(data.interests)) throw new Error("interests_unavailable");
      if (!controller.signal.aborted) setAll(data.interests);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [open, all, retry]);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { if (catalog) setCatalog(false); else onClose(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, catalog, onClose]);

  const draft = readPeopleFilters(new URLSearchParams({ gender, ageMin: low, ageMax: high, ...(selected.length ? { interests: selected.join(",") } : {}) }));
  const lower = Math.min(65, Math.max(18, Number(low) || 18));
  const upper = Math.min(65, Math.max(lower, Number(high) || 65));
  function reset() { setGender("all"); setLow("18"); setHigh("65"); setSelected([]); }
  function toggle(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : ids.length < 100 ? [...ids, id] : ids); }
  const preview = [...(all ?? []).filter(i => selected.includes(i.id)), ...PREVIEW.flatMap(name => (all ?? []).filter(i => i.name === name && !selected.includes(i.id)))].slice(0, 6);
  const groups = groupInterests((all ?? []).filter(i => i.name.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"))));
  const close = () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); onClose(); };
  return <Sheet open={open} onClose={close} label="Фильтры людей" cls="people-filter-sheet">
    <div className="people-sheet-head">
      <h2 className="t">{catalog ? "Интересы" : "Фильтры"}</h2>
      <button className="rb gl" onClick={catalog ? () => { setCatalog(false); setSearch(""); } : close} aria-label={catalog ? "Назад к фильтрам" : "Закрыть фильтры"}><Ic n={catalog ? "back" : "close"} /></button>
    </div>
    {catalog && <label className="field gl people-interest-search"><Ic n="search" c="s" /><input placeholder="Найти интерес" value={search} onChange={e => setSearch(e.target.value)} /></label>}
    <div className="people-sheet-scroll" key={catalog ? "catalog" : "filters"}>
      {!catalog && <>
        <span className="people-field-title">Кого показывать</span>
        <div className="people-gender" role="group" aria-label="Кого показывать">
          {([["all", "Все"], ["male", "Мужчины"], ["female", "Женщины"]] as const).map(([key, label]) => <button key={key} aria-pressed={gender === key} onClick={() => setGender(key)}>{label}</button>)}
        </div>
        <span className="people-field-title">Возраст</span>
        <div className="people-age-fields">
          <label className="field gl"><span>От</span><input aria-label="Возраст от" inputMode="numeric" value={low} maxLength={2} onChange={e => setLow(e.target.value.replace(/\D/g, ""))} /></label>
          <label className="field gl"><span>До</span><input aria-label="Возраст до" inputMode="numeric" value={high} maxLength={2} onChange={e => setHigh(e.target.value.replace(/\D/g, ""))} />{high === "65" && <span aria-label="Без верхнего ограничения">+</span>}</label>
        </div>
        <div className="people-age-range" style={{ "--age-low": `${(lower - 18) / 47 * 100}%`, "--age-high": `${(upper - 18) / 47 * 100}%` } as CSSProperties}>
          <div className="people-age-track" />
          <input type="range" min={18} max={65} value={lower} aria-label="Минимальный возраст" onChange={e => { setLow(e.target.value); if (Number(e.target.value) > upper) setHigh(e.target.value); }} style={{ zIndex: lower > 41 ? 3 : 2 }} />
          <input type="range" min={18} max={65} value={upper} aria-label="Максимальный возраст" onChange={e => { setHigh(e.target.value); if (Number(e.target.value) < lower) setLow(e.target.value); }} />
        </div>
        {!draft && <p className="people-filter-error" role="alert">Укажи возраст от 18 до 65+. Значение «от» не должно быть больше «до».</p>}
        <span className="people-field-title">Интересы</span>
        <p className="people-filter-hint">Хотя бы один из выбранных</p>
      </>}
      {all === null && (failed ? <button className="btn o" onClick={() => setRetry(n => n + 1)}>Загрузить интересы ещё раз</button> : <p className="people-filter-hint" role="status">Загружаем интересы…</p>)}
      {catalog ? <>
        {groups.map(g => <section className="igroup" key={g.title}><h3>{g.title}</h3><div className="igrid">
          {g.items.map(i => <button className={`it ${selected.includes(i.id) ? "sel" : ""}`} aria-pressed={selected.includes(i.id)} key={i.id} onClick={() => toggle(i.id)}>
            <span className="ck"><Ic n="check" /></span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={interestIcon(i.name)} alt="" loading="lazy" /><span>{i.name}</span>
          </button>)}
        </div></section>)}
        {all !== null && !groups.length && <p className="people-filter-hint">Такой интерес не найден. Попробуй другое название.</p>}
      </> : <>
        <div className="people-interest-pills">{preview.map(i => <button key={i.id} aria-pressed={selected.includes(i.id)} onClick={() => toggle(i.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={interestIcon(i.name)} alt="" /><span>{i.name}</span>
        </button>)}</div>
        <button className="people-filter-link" onClick={() => setCatalog(true)}>Все интересы{selected.length > 0 ? ` · ${selected.length}` : ""}<Ic n="chev" c="xs" /></button>
      </>}
    </div>
    <div className="people-sheet-footer">
      {catalog ? <button className="btn v" onClick={() => { setCatalog(false); setSearch(""); }}>Готово{selected.length ? ` · ${selected.length}` : ""}</button> : <>
        <button className="btn v" disabled={!draft} onClick={() => { if (draft) { close(); onApply(draft); } }}>Показать анкеты</button>
        <button className="people-filter-link" onClick={reset} disabled={gender === DEFAULT_PEOPLE_FILTERS.gender && low === "18" && high === "65" && !selected.length}>Сбросить</button>
      </>}
    </div>
  </Sheet>;
}
