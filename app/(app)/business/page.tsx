"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { EmptyIll, Ic, Overlay, Screen, costShort, dayShort, type HeroEvent } from "@/components/proto/ui";
import { KI, bg } from "@/components/proto/k";
import { cityIn } from "@/components/promotions/Promote";
import { CalendarSheet } from "@/components/proto/pickers";
import { cityDates } from "@/lib/events/local-dates";
import { goBack } from "@/lib/nav/back";
import { KIND_LABEL, type CityEvent } from "@/lib/city-events";
import { bizCategoryCounts, bizCategoryIcon, matchesBizCategory } from "@/lib/events/biz-categories";

/** Фильтр «Когда». */
type When = "all" | "today" | "tomorrow" | "weekend" | "date";
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function isoPlus(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** «Сегодня, 6 ноября» / «Завтра, суббота 7» / «Пн, 9 ноября» — как в прототипе. */
const WDL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
function dayTitle(iso: string, today: string, tomorrow: string) {
  const d = new Date(`${iso}T12:00:00`);
  const dm = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (iso === today) return `Сегодня, ${dm}`;
  if (iso === tomorrow) return `Завтра, ${WDL[d.getDay()]} ${d.getDate()}`;
  return `${WD[d.getDay()]}, ${dm}`;
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
  const [searchOpen, setSearchOpen] = useState(false);
  useGuide("business");

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

  const city = events?.[0]?.city ?? cityEv[0]?.city ?? null;
  const QD: [When, string][] = [
    ["today", "Сегодня"],
    ["tomorrow", "Завтра"],
    ["weekend", "Выходные"],
  ];

  return (
    <Screen id="business" anim="in">
      <div className="k-top">
        <button className="k-rb k-g k-pr" onClick={() => goBack(router, "/feed")} aria-label="Назад">
          <KI n="back" />
        </button>
        <div className="k-pair k-g">
          <Link className="k-pr" href={`/map?business=only${cat ? `&cat=${cat}` : ""}${mapDate}`} aria-label="На карте">
            <KI n="map" />
          </Link>
          <i />
          <button className="k-pr" onClick={() => setSearchOpen((v) => !v)} aria-label="Поиск">
            <KI n="search" />
          </button>
        </div>
      </div>
      <h1 className="k-h1" style={{ marginTop: 18 }}>
        Афиша <em>заведений</em>
      </h1>
      <p className="k-sub2">Кафе, бары и площадки{city ? ` в ${cityIn(city)}` : " рядом"}</p>

      {(searchOpen || q) && (
        <label className="sfield gl" style={{ marginBottom: 12 }}>
          <Ic n="search" c="s" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Событие или заведение" enterKeyHint="search" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Очистить">
              <Ic n="close" c="xs" />
            </button>
          )}
        </label>
      )}

      <div className="k-hs" style={{ gap: 8 }}>
        <button className={`k-chip k-g k-pr ${!cat ? "k-on" : ""}`} onClick={() => setCat(null)}>
          Все
        </button>
        {counts.map(({ cat: c }) => (
          <button key={c.key} className={`k-chip k-g k-pr ${cat === c.key ? "k-on" : ""}`} onClick={() => setCat(cat === c.key ? null : c.key)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bizCategoryIcon(c)} alt="" style={{ width: 20, height: 20 }} />
            {c.label}
          </button>
        ))}
      </div>
      <div className="k-qd">
        <button className={`k-chip k-g k-pr k-qcal ${when === "date" ? "k-on" : ""}`} onClick={() => setCalOpen(true)} aria-label="Календарь">
          <KI n="cal" />
          <span>{when === "date" && pick ? dayShort(pick) : ""}</span>
        </button>
        {QD.map(([k, label]) => (
          <button key={k} className={`k-chip k-g k-pr ${when === k ? "k-on" : ""}`} onClick={() => setWhen(when === k ? "all" : k)}>
            {label}
          </button>
        ))}
        <button className={`k-chip k-g k-pr ${free ? "k-on" : ""}`} onClick={() => setFree(!free)}>
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
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="sk" style={{ height: 136, borderRadius: 26 }} />
          ))}
        </div>
      )}
      <div className="K">
        <div className="k-list k-afl">
          {groups.map(({ iso, list }) => (
            <div key={iso} className="k-dgrp">
              <h4 className="k-dayh">{dayTitle(iso, days.today, days.tomorrow)}</h4>
              {list.map((e) => (
                <BizRow key={e.id} e={e} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {events !== null && events.length > 0 && shownEvents?.length === 0 && shownCity.length === 0 && (
        <div className="empty" style={{ marginTop: 16 }}>
          <b>Ничего не нашли</b>
          <span>Попробуй другой день или раздел.</span>
          <button className="btn sm v" style={{ marginTop: 12, width: "auto", padding: "0 18px" }} onClick={reset}>
            Сбросить фильтры
          </button>
        </div>
      )}
      {events?.length === 0 && shownCity.length === 0 && (
        <div className="empty">
          <EmptyIll />
          <b>Заведения {city ? `в ${cityIn(city)}` : "рядом"} пока не публиковали события</b>
          <span>Как только появятся — покажем здесь и на карте.</span>
        </div>
      )}
      {shownCity.length > 0 && (
        <div className="K">
          <div className="k-dgrp">
            <h4 className="k-dayh">Что ещё в городе</h4>
            {shownCity.map((c) => (
              <Link key={c.id} href={`/city/${c.id}`} className="k-afr k-g k-pr">
                <i style={bg(c.photoUrl, 240)}>{c.priceText && <span className="k-chip k-gw">{c.priceText}</span>}</i>
                <span className="k-x">
                  <b>{c.title}</b>
                  <small>
                    {cityDay(c)} · {KIND_LABEL[c.kind ?? ""] ?? "Событие"}
                  </small>
                  {c.placeName && <small className="k-vn">{c.placeName}</small>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Своё событие для заведения — кнопка всегда внизу по центру. */}
      <Overlay>
        <Link className="mapfab" href="/create?business=true">
          <Ic n="plus" />
          Создать событие
        </Link>
      </Overlay>
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
    </Screen>
  );
}

/** Компактная строка события заведения (вид «списком»). */
function BizRow({ e }: { e: HeroEvent }) {
  const left = Math.max(0, e.seatsTotal - e.seatsTaken);
  const price = e.businessPricingType === "free" ? "Бесплатно" : costShort(e);
  return (
    <Link href={`/events/${e.id}`} className="k-afr k-g k-pr">
      <i style={bg(e.photoUrl, 240)}>{price && <span className="k-chip k-gw">{left > 0 ? price : "Мест нет"}</span>}</i>
      <span className="k-x">
        <b>{e.title}</b>
        <small>
          {e.eventTime.slice(0, 5)}
          {e.placeName ? ` · ${e.placeName}` : ""}
        </small>
        {e.organizer?.name && <small className="k-vn">{e.organizer.name}</small>}
      </span>
    </Link>
  );
}

function cityDay(c: CityEvent) {
  const today = new Date().toISOString().slice(0, 10);
  const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  if (c.endDate && c.eventDate <= today) return `идёт · до ${f(c.endDate)}`;
  return `${f(c.eventDate)}${c.eventTime ? `, ${c.eventTime.slice(0, 5)}` : ""}`;
}
