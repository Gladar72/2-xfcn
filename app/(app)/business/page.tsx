"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { EmptyIll, HeroCard, Ic, Overlay, Screen, type HeroEvent } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { Cover } from "@/components/proto/ui";
import { KIND_LABEL, cityEventIcon, type CityEvent } from "@/lib/city-events";
import { bizCategoryCounts, bizCategoryIcon, matchesBizCategory } from "@/lib/events/biz-categories";

/** «Для бизнеса» (SCR.business прототипа): как это работает + ближайшие события. */
export default function BusinessPage() {
  const router = useRouter();
  const [events, setEvents] = useState<HeroEvent[] | null>(null);
  const [cityEv, setCityEv] = useState<CityEvent[]>([]);
  // Категория (кафе, бары, концерты…) — фильтрует и события заведений, и «Что ещё в городе».
  const [cat, setCat] = useState<string | null>(null);
  useGuide("business");
  const cityTagged = cityEv.map((c) => ({ c, tag: { title: c.title, kind: c.kind } }));
  const counts = bizCategoryCounts([...(events ?? []), ...cityTagged.map((x) => x.tag)]);
  const shownEvents = events?.filter((e) => matchesBizCategory(e, cat)) ?? null;
  const shownCity = cityTagged.filter((x) => matchesBizCategory(x.tag, cat)).map((x) => x.c);

  useEffect(() => {
    fetch("/api/events?business=true&page=0")
      .then((r) => r.json())
      .then((d) => setEvents((d.items ?? []).filter((e: HeroEvent) => e.isBusiness)))
      .catch(() => setEvents([]));
    fetch("/api/city-events")
      .then((r) => r.json())
      .then((d) => setCityEv(d.items ?? []))
      .catch(() => {});
  }, []);

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
      {counts.length > 1 && (
        <div className="cats" style={{ marginTop: 18 }}>
          <button className={`cat ${!cat ? "on" : "gl"}`} style={{ paddingLeft: 16 }} onClick={() => setCat(null)}>
            Все
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
      )}
      <div className="sec">
        <b>Ближайшие события</b>
        <span>{shownEvents?.length ?? ""}</span>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {events === null && [0, 1].map((i) => <div key={i} className="sk" style={{ height: 290, borderRadius: 32 }} />)}
        {shownEvents?.map((e) => <HeroCard key={e.id} e={e} full />)}
        {cat && events && events.length > 0 && shownEvents?.length === 0 && (
          <div className="empty">
            <b>В этой категории пока нет событий заведений</b>
          </div>
        )}
        {events?.length === 0 && (
          <div className="empty">
            <EmptyIll />
            <b>Пока нет событий</b>
            <span>Стань первым — создай концерт, дегустацию или мастер-класс.</span>
          </div>
        )}
      </div>
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
      {/* Как на главной — по центру внизу: карта только с событиями заведений. */}
      <Overlay>
        <Link className="mapfab" href={`/map?business=only${cat ? `&cat=${cat}` : ""}`}>
          <Ic n="map" />
          Карта
        </Link>
      </Overlay>
    </Screen>
  );
}

function cityDay(c: CityEvent) {
  const today = new Date().toISOString().slice(0, 10);
  const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  if (c.endDate && c.eventDate <= today) return `идёт · до ${f(c.endDate)}`;
  return `${f(c.eventDate)}${c.eventTime ? `, ${c.eventTime.slice(0, 5)}` : ""}`;
}
