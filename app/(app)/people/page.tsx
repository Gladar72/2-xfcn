"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PersonView, type Person } from "@/components/people/PersonView";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { photoThumb } from "@/lib/photos/thumb";

interface Card {
  id: string;
  name: string;
  age: number;
  avatarUrl: string | null;
  ratingAvg: number;
  completedMeetingsCount: number;
  sharedInterests: string[];
  distanceKm?: number | null;
}

/** Короткий профиль из карточки — показываем сразу, пока грузится полный. */
function quick(c: Card): Person {
  return {
    id: c.id,
    name: c.name,
    age: c.age,
    avatarUrl: c.avatarUrl,
    photos: c.avatarUrl ? [c.avatarUrl] : [],
    ratingAvg: c.ratingAvg,
    completedMeetingsCount: c.completedMeetingsCount,
    interests: c.sharedInterests,
    commonInterests: c.sharedInterests,
    distanceKm: c.distanceKm,
  };
}

/**
 * Колода «Люди рядом» (как в Tinder): люди с похожими интересами из
 * твоего города. Свайп вбок — следующий человек, тап по фото — другие
 * фото, свайп вверх — о себе, внизу «Позвать на встречу».
 * Безопасность: только город (никакой точной геопозиции), без скрытых,
 * заблокированных и забаненных профилей.
 */
export default function PeopleDeckPage() {
  return (
    <Suspense>
      <Deck />
    </Suspense>
  );
}

function Deck() {
  const router = useRouter();
  const sp = useSearchParams();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [ix, setIx] = useState(0);
  const [from, setFrom] = useState<1 | -1 | 0>(0);
  const cache = useRef(new Map<string, Person | null>());
  const [, force] = useState(0);
  const [askGeo, setAskGeo] = useState(false);

  function load() {
    return fetch("/api/people?deck=1")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.items ?? []) as Card[];
        const start = sp.get("start");
        const i = start ? list.findIndex((c) => c.id === start) : -1;
        setCards(list);
        setIx(i > 0 ? i : 0);
        setAskGeo(d.meHasLocation === false && !geoDismissed());
      })
      .catch(() => setCards([]));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Разрешить примерную геопозицию — на сервер уходит огрублённая точка. */
  function allowGeo() {
    setAskGeo(false);
    dismissGeo();
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        fetch("/api/me/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        })
          .then(() => {
            cache.current.clear();
            return load();
          })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 10 * 60e3, timeout: 15e3 }
    );
  }

  // Заранее подгружаем соседей: следующий профиль и его фото уже готовы.
  useEffect(() => {
    if (!cards) return;
    for (const c of [cards[ix], cards[ix + 1], cards[ix + 2], cards[ix - 1]]) {
      if (!c || cache.current.has(c.id)) continue;
      cache.current.set(c.id, null);
      if (c.avatarUrl) new Image().src = photoThumb(c.avatarUrl, 300);
      fetch(`/api/users/${c.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) {
            for (const src of (d.photos ?? []) as string[]) new Image().src = photoThumb(src, 300);
            cache.current.set(c.id, d);
            force((n) => n + 1);
          }
        })
        .catch(() => {});
    }
  }, [cards, ix]);

  if (cards === null)
    return (
      <section className="scr pr aurora fade" data-id="person">
        <div className="gal">
          <div className="sk" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
        </div>
      </section>
    );

  const c = cards[ix];
  if (!c)
    return (
      <section className="scr aurora in" data-id="deck-end">
        <div className="bar-top" style={{ padding: "0 20px" }}>
          <button className="rb gl" onClick={() => goBack(router, "/feed")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <span />
        </div>
        <div className="done" style={{ paddingTop: 120 }}>
          <div className="burst">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mosyaSrc("sit")} alt="" />
          </div>
          <h1 className="t">
            {cards.length ? (
              <>
                Пока <em>всё</em>
              </>
            ) : (
              <>
                Скоро здесь <em>появятся</em> люди
              </>
            )}
          </h1>
          <p>
            {cards.length
              ? "Ты посмотрел всех, кто рядом. Создай встречу — и люди с похожими интересами найдут тебя сами."
              : "Добавь интересы в профиле — Мося подберёт людей, с которыми тебе будет о чём поговорить."}
          </p>
        </div>
        <div className="foot">
          <Link className="btn v" href="/create">
            <Ic n="plus" />
            Создать встречу
          </Link>
          {cards.length > 0 && (
            <button
              className="btn o"
              onClick={() => {
                setFrom(-1);
                setIx(0);
              }}
            >
              Смотреть сначала
            </button>
          )}
        </div>
      </section>
    );

  const next = cards[ix + 1];
  const cached = cache.current.get(c.id);
  return (
    <>
      {/* Под карточкой видно следующего — как стопка в Tinder. */}
      <div className="deck-under">
        {next?.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoThumb(next.avatarUrl, 300)} alt="" decoding="async" />
        )}
      </div>
      <PersonView
      key={c.id}
      id={c.id}
      initial={cached ?? quick(c)}
      deck={{
        hasPrev: ix > 0,
        from,
        onSwipe: (dir) => {
          setFrom(dir);
          setIx((i) => Math.max(0, i + dir));
        },
      }}
      />
      {askGeo && (
        <div className="geo-ask gl">
          <span>Покажем, кто ближе к тебе. Видно только примерное расстояние — точное место никто не узнает.</span>
          <button onClick={allowGeo}>Разрешить</button>
        </div>
      )}
    </>
  );
}

const GEO_KEY = "mesto_geo_asked";
function geoDismissed() {
  try {
    return localStorage.getItem(GEO_KEY) === "1";
  } catch {
    return false;
  }
}
function dismissGeo() {
  try {
    localStorage.setItem(GEO_KEY, "1");
  } catch {
    /* без хранилища просто спросим ещё раз */
  }
}
