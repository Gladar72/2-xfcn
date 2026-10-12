"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { EmptyIll, HeroCard, Ic, Overlay, Screen, type HeroEvent } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { Cover } from "@/components/proto/ui";
import { KIND_LABEL, cityEventIcon, type CityEvent } from "@/lib/city-events";

/** «Для бизнеса» (SCR.business прототипа): как это работает + ближайшие события. */
export default function BusinessPage() {
  const router = useRouter();
  const [events, setEvents] = useState<HeroEvent[] | null>(null);
  const [cityEv, setCityEv] = useState<CityEvent[]>([]);
  useGuide("business");

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
      <div className="sec">
        <b>Ближайшие события</b>
        <span>{events?.length ?? ""}</span>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {events === null && [0, 1].map((i) => <div key={i} className="sk" style={{ height: 290, borderRadius: 32 }} />)}
        {events?.map((e) => <HeroCard key={e.id} e={e} full />)}
        {events?.length === 0 && (
          <div className="empty">
            <EmptyIll />
            <b>Пока нет событий</b>
            <span>Стань первым — создай концерт, дегустацию или мастер-класс.</span>
          </div>
        )}
      </div>
      {cityEv.length > 0 && (
        <>
          <div className="sec">
            <b>Что ещё в городе</b>
            <span>{cityEv.length}</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {cityEv.map((c) => (
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
        <Link className="mapfab" href="/map?business=only">
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
