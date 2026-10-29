"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { EmptyIll, HeroCard, Ic, Overlay, Screen, costShort, dayShort, eventIcon, type HeroEvent } from "@/components/proto/ui";
import { CalendarSheet } from "@/components/proto/pickers";
import { cityDates } from "@/lib/events/local-dates";
import { goBack } from "@/lib/nav/back";
import { Cover } from "@/components/proto/ui";
import { KIND_LABEL, cityEventIcon, type CityEvent } from "@/lib/city-events";
import { bizCategoryCounts, bizCategoryIcon, matchesBizCategory } from "@/lib/events/biz-categories";

/** Фильтр «Когда». */
type When = "all" | "today" | "tomorrow" | "weekend" | "date";
const WHEN: [When, string][] = [
  ["all", "Все дни"],
  ["today", "Сегодня"],
  ["tomorrow", "Завтра"],
  ["weekend", "Выходные"],
];
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const VIEW_KEY = "mesto_biz_view";

function isoPlus(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** «Сегодня» / «Завтра» / «Сб, 1 нояб». */
function dayTitle(iso: string, today: string, tomorrow: string) {
  if (iso === today) return "Сегодня";
  if (iso === tomorrow) return "Завтра";
  const d = new Date(`${iso}T12:00:00`);
  return `${WD[d.getDay()]}, ${dayShort(iso)}`;
}

function inWhen(iso: string, endIso: string | null, when: When, pick: string | null, days: ReturnType<typeof cityDates>) {
  const end = endIso && endIso > iso ? endIso : iso; // многодневные события города — пока идут
  const hit = (a: string, b: string) => iso <= b && end >= a;
  if (when === "today") return hit(days.today, days.today);
  if (when === "tomorrow") return hit(days.tomorrow, days.tomorrow);
  if (when === "weekend") return hit(days.weekend.from, days.weekend.to);
  if (when === "date" && pick) return hit(pick, pick);
  return true;
}

const norm = (t: string | null | undefined) => (t ?? "").toLowerCase().replace(/ё/g, "е");

/** «Для бизнеса» (SCR.business прототипа): как это работает + события с фильтрами (поиск, раздел, когда, бесплатно). */
export default function BusinessPage() {
  const router = useRouter();
  const [events, setEvents] = useState<(HeroEvent & { city?: string | null })[] | null>(null);
  const [cityEv, setCityEv] = useState<CityEvent[]>([]);
  // Раздел (кафе, бары, концерты…) — фильтрует и события заведений, и «Что ещё в городе».
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [pick, setPick] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [free, setFree] = useState(false);
  const [view, setView] = useState<"cards" | "list">("cards");
  useGuide("business");

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);
  function changeView(v: "cards" | "list") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  useEffect(() => {
    // Все страницы ленты заведений (раньше грузилась только первая — 20 событий).
    let cancelled = false;
    (async () => {
      const all: (HeroEvent & { city?: string | null })[] = [];
      for (let page = 0; page < 10; page++) {
        const d = await fetch(`/api/events?business=true&page=${page}`)
          .then((r) => r.json())
          .catch(() => null);
        if (!d) break;
        all.push(...(d.items ?? []).filter((e: HeroEvent) => e.isBusiness));
        if (!d.hasMore) break;
      }
      if (!cancelled) setEvents(all);
    })();
    fetch("/api/city-events")
      .then((r) => r.json())
      .then((d) => !cancelled && setCityEv(d.items ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(() => cityDates(events?.[0]?.city ?? cityEv[0]?.city ?? null), [events, cityEv]);
  const query = norm(q.trim());

  // Все фильтры, кроме раздела — счётчики у разделов считаются по ним.
  const baseEvents = useMemo(
    () =>
      (events ?? []).filter(
        (e) =>
          inWhen(e.eventDate, null, when, pick, days) &&
          (!free || e.businessPricingType === "free" || /бесплат/i.test(e.businessPricingDetails ?? "")) &&
          (!query || norm(`${e.title} ${e.placeName ?? ""} ${e.organizer?.name ?? ""}`).includes(query))
      ),
    [events, when, pick, days, free, query]
  );
  const baseCity = useMemo(
    () =>
      cityEv.filter(
        (c) =>
          inWhen(c.eventDate, c.endDate, when, pick, days) &&
          (!free || /бесплат/i.test(c.priceText ?? "")) &&
          (!query || norm(`${c.title} ${c.placeName ?? ""}`).includes(query))
      ),
    [cityEv, when, pick, days, free, query]
  );
  const cityTagged = baseCity.map((c) => ({ c, tag: { title: c.title, kind: c.kind } }));
  const counts = bizCategoryCounts([...baseEvents, ...cityTagged.map((x) => x.tag)]);
  const total = baseEvents.length + baseCity.length;
  const shownEvents = events === null ? null : baseEvents.filter((e) => matchesBizCategory(e, cat));
  const shownCity = cityTagged.filter((x) => matchesBizCategory(x.tag, cat)).map((x) => x.c);
  const filtered = !!cat || when !== "all" || free || !!query;
  const found = (shownEvents?.length ?? 0) + shownCity.length;

  // События заведений по дням: «Сегодня», «Завтра», «Сб, 1 нояб».
  const groups = useMemo(() => {
    const m = new Map<string, HeroEvent[]>();
    for (const e of shownEvents ?? []) {
      const list = m.get(e.eventDate) ?? [];
      list.push(e);
      m.set(e.eventDate, list);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, list]) => ({ iso, list: list.sort((a, b) => a.eventTime.localeCompare(b.eventTime)) }));
  }, [shownEvents]);

  function reset() {
    setCat(null);
    setQ("");
    setWhen("all");
    setPick(null);
    setFree(false);
  }

  const mapDate = when === "today" || when === "tomorrow" || when === "weekend" ? `&date=${when}` : "";

  return (
    <Screen id="business" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => goBack(router, "/feed")} aria-label="Назад">
          <Ic n="back" />
        </button>
        <span />
      </div>
      <h1 className="t" style={{ marginTop: 18 }}>
        Для <em>бизнеса</em>
      </h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.5 }}>
        Посетить или создать событие — концерты, дегустации, мастер-классы. Все события на общей карте города.
      </p>
      <Link className="btn v" style={{ marginTop: 16 }} href="/create?business=true">
        <Ic n="plus" />
        Создать событие
      </Link>
      <div className="how">
        {(
          [
            ["1", "Создаёте событие", "с фото, временем и ценой билета"],
            ["2", "Принимаете заявки", "гость получает номер билета"],
            ["3", "Отмечаете на входе", "оплата — вам лично, на месте"],
          ] as const
        ).map(([n, b, s]) => (
          <div key={n} className="gl">
            <span className="k">{n}</span>
            <b>{b}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {/* Поиск и вид: карточки / списком. */}
      <div className="bzf-top">
        <label className="sfield gl">
          <Ic n="search" c="s" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Событие или заведение" enterKeyHint="search" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Очистить">
              <Ic n="close" c="xs" />
            </button>
          )}
        </label>
        <div className="bzf-view gl" role="tablist" aria-label="Вид">
          <button type="button" className={view === "cards" ? "on" : ""} onClick={() => changeView("cards")} aria-label="Карточки">
            <Ic n="grid" c="s" />
          </button>
          <button type="button" className={view === "list" ? "on" : ""} onClick={() => changeView("list")} aria-label="Списком">
            <Ic n="list" c="s" />
          </button>
        </div>
      </div>

      <span className="bzf-l">Раздел</span>
      <div className="cats">
        <button className={`cat ${!cat ? "on" : "gl"}`} style={{ paddingLeft: 16 }} onClick={() => setCat(null)}>
          Все <span style={{ opacity: 0.55, marginLeft: 2 }}>{total}</span>
        </button>
        {counts.map(({ cat: c, count }) => (
          <button key={c.key} className={`cat ${cat === c.key ? "on" : "gl"}`} onClick={() => setCat(cat === c.key ? null : c.key)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bizCategoryIcon(c)} alt="" />
            {c.label}
            <span style={{ opacity: 0.55, marginLeft: 2 }}>{count}</span>
          </button>
        ))}
      </div>

      <span className="bzf-l">Когда</span>
      <div className="cats">
        {WHEN.map(([k, label]) => (
          <button key={k} className={`cat np ${when === k ? "on" : "gl"}`} onClick={() => setWhen(k)}>
            {label}
          </button>
        ))}
        <button className={`cat np ${when === "date" ? "on" : "gl"}`} onClick={() => setCalOpen(true)}>
          <Ic n="cal" c="xs" />
          {when === "date" && pick ? dayShort(pick) : "Дата"}
        </button>
        <button className={`cat np ${free ? "on" : "gl"}`} onClick={() => setFree(!free)}>
          Бесплатно
        </button>
      </div>

      {filtered && events !== null && (
        <div className="bzf-found">
          <b>Найдено {found}</b>
          <button type="button" onClick={reset}>
            Сбросить <Ic n="close" c="xs" />
          </button>
        </div>
      )}

      {events === null && (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {[0, 1].map((i) => (
            <div key={i} className="sk" style={{ height: 290, borderRadius: 32 }} />
          ))}
        </div>
      )}
      {groups.map(({ iso, list }) => (
        <div key={iso}>
          <div className="sec">
            <b>{dayTitle(iso, days.today, days.tomorrow)}</b>
            <span>
              {list.length} {plural(list.length, "событие", "события", "событий")}
            </span>
          </div>
          {view === "cards" ? (
            <div style={{ display: "grid", gap: 12 }}>
              {list.map((e) => (
                <HeroCard key={e.id} e={e} full />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 1fr)" }}>
              {list.map((e) => (
                <BizRow key={e.id} e={e} />
              ))}
            </div>
          )}
        </div>
      ))}
      {events !== null && events.length > 0 && shownEvents?.length === 0 && shownCity.length === 0 && (
        <div className="empty" style={{ marginTop: 16 }}>
          <b>Ничего не нашли</b>
          <span>Попробуй другой день или раздел.</span>
          <button className="btn sm v" style={{ marginTop: 12, width: "auto", padding: "0 18px" }} onClick={reset}>
            Сбросить фильтры
          </button>
        </div>
      )}
      {events?.length === 0 && (
        <div className="empty">
          <EmptyIll />
          <b>Пока нет событий</b>
          <span>Стань первым — создай концерт, дегустацию или мастер-класс.</span>
        </div>
      )}
      {shownCity.length > 0 && (
        <>
          <div className="sec">
            <b>Что ещё в городе</b>
            <span>{shownCity.length}</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {shownCity.map((c) => (
              <Link key={c.id} href={`/city/${c.id}`} className="gl cityrow">
                <Cover photoUrl={c.photoUrl} icon={cityEventIcon(c.kind)} cls="cr-ph" thumb={200} />
                <div className="cr-i">
                  <small>{KIND_LABEL[c.kind ?? ""] ?? "Событие"}</small>
                  <b>{c.title}</b>
                  <span>
                    {cityDay(c)}
                    {c.placeName ? ` · ${c.placeName}` : ""}
                  </span>
                </div>
                {c.priceText && <span className="cr-p">{c.priceText}</span>}
              </Link>
            ))}
          </div>
        </>
      )}
      <div style={{ height: 90 }} />
      <CalendarSheet
        open={calOpen}
        onClose={() => setCalOpen(false)}
        dayIndex={pick ? Math.max(0, Math.round((new Date(`${pick}T12:00:00`).getTime() - new Date(`${isoPlus(0)}T12:00:00`).getTime()) / 864e5)) : 0}
        maxDays={90}
        onPick={(i) => {
          setPick(isoPlus(i));
          setWhen("date");
          setCalOpen(false);
        }}
      />
      {/* Как на главной — по центру внизу: карта только с событиями заведений, с теми же фильтрами. */}
      <Overlay>
        <Link className="mapfab" href={`/map?business=only${cat ? `&cat=${cat}` : ""}${mapDate}`}>
          <Ic n="map" />
          Карта
        </Link>
      </Overlay>
    </Screen>
  );
}

/** Компактная строка события заведения (вид «списком»). */
function BizRow({ e }: { e: HeroEvent }) {
  const left = Math.max(0, e.seatsTotal - e.seatsTaken);
  const price = e.businessPricingType === "free" ? "Бесплатно" : costShort(e);
  return (
    <Link href={`/events/${e.id}`} className="bzrow gl">
      <Cover photoUrl={e.photoUrl} icon={eventIcon(e)} cls="th" thumb={160} />
      <div className="i">
        <b>{e.title}</b>
        <span>
          {e.eventTime.slice(0, 5)}
          {e.placeName ? ` · ${e.placeName}` : ""}
          {left > 0 ? ` · ${left} ${plural(left, "место", "места", "мест")}` : " · мест нет"}
        </span>
      </div>
      <span className="bzp">{price}</span>
    </Link>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function cityDay(c: CityEvent) {
  const today = new Date().toISOString().slice(0, 10);
  const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  if (c.endDate && c.eventDate <= today) return `идёт · до ${f(c.endDate)}`;
  return `${f(c.eventDate)}${c.eventTime ? `, ${c.eventTime.slice(0, 5)}` : ""}`;
}
