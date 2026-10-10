"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGuide } from "@/lib/mosya/guide";
import { EmptyIll, HeroCard, Ic, Screen, type HeroEvent } from "@/components/proto/ui";

/** «Для бизнеса» (SCR.business прототипа): как это работает + ближайшие события. */
export default function BusinessPage() {
  const router = useRouter();
  const [events, setEvents] = useState<HeroEvent[] | null>(null);
  useGuide("business");

  useEffect(() => {
    fetch("/api/events?business=true&page=0")
      .then((r) => r.json())
      .then((d) => setEvents((d.items ?? []).filter((e: HeroEvent) => e.isBusiness)))
      .catch(() => setEvents([]));
  }, []);

  return (
    <Screen id="business" anim="in">
      <div className="bar-top">
        <button className="rb gl" onClick={() => router.back()} aria-label="Назад">
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
    </Screen>
  );
}
