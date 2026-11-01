"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PersonView, type Person } from "@/components/people/PersonView";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { watchMyLocation, sendMyLocation } from "@/lib/geo/client-location";
import { say } from "@/lib/mosya/peek";
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
  distanceM?: number | null;
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
    distanceM: c.distanceM,
  };
}

/**
 * Колода «Люди рядом» (как в Tinder): люди с похожими интересами из
 * текущего местоположения (без геопозиции — из твоего города). Свайп вбок — следующий человек, тап по фото — другие
 * фото, свайп вверх — о себе, внизу «Позвать на встречу».
 * Безопасность: только примерное расстояние, без точной геопозиции, скрытых,
 * заблокированных и забаненных профилей.
 */
export default function PeopleDeckPage() {
  return (
    <Suspense>
      <DeckRoute />
    </Suspense>
  );
}

function DeckRoute() {
  const sp = useSearchParams();
  const start = sp.get("start");
  // Query-only navigation must not retain another person's deck/index/cache.
  return <Deck key={start ?? "all"} start={start} />;
}

function Deck({ start }: { start: string | null }) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ix, setIx] = useState(0);
  const [from, setFrom] = useState<1 | -1 | 0>(0);
  const cache = useRef(new Map<string, Person | null>());
  const [, force] = useState(0);
  const [askGeo, setAskGeo] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const currentCard = useRef<string | null>(null);
  currentCard.current = cards?.[ix]?.id ?? null;
  const request = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const latestCards = useRef(cards);
  latestCards.current = cards;

  const load = useCallback((refresh = false) => {
    refresh = refresh && loaded.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!refresh) setCards(null);
    setError(null);
    const selected = refresh ? currentCard.current : start;
    return fetch(`/api/people?deck=1${selected ? `&start=${encodeURIComponent(selected)}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("people_unavailable");
        return r.json();
      })
      .then((d) => {
        if (controller.signal.aborted) return;
        const list = (d.items ?? []) as Card[];
        const keep = refresh ? currentCard.current : selected;
        const i = keep ? list.findIndex((c) => c.id === keep) : -1;
        if (!refresh && start && i < 0) {
          setError("Этот профиль больше недоступен.");
          setCards([]);
          return;
        }
        // Keep full profile details, but use newly calculated distances.
        for (const c of list) {
          const cached = cache.current.get(c.id);
          if (cached) cache.current.set(c.id, { ...cached, distanceKm: c.distanceKm, distanceM: c.distanceM });
        }
        loaded.current = true;
        latestCards.current = list;
        setHasLocation(d.meHasLocation === true);
        setCards(list);
        setIx(i > 0 ? i : 0);
        setAskGeo(d.meHasLocation === false && !geoDismissed());
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        if (refresh) return;
        setError("Не удалось загрузить людей. Попробуй ещё раз.");
        setCards([]);
      });
  }, [start]);
  useEffect(() => {
    load();
    return () => request.current?.abort();
  }, [load]);

  useEffect(() => watchMyLocation(() => { void load(true); }), [load]);

  async function allowGeo() {
    setGeoBusy(true);
    const ok = await sendMyLocation();
    setGeoBusy(false);
    if (ok) {
      setAskGeo(false);
      dismissGeo();
      void load(true);
    } else {
      say("Разреши геопозицию в настройках — и я покажу, кто рядом и на каком расстоянии");
    }
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
          if (!d.error && d.id === c.id) {
            for (const src of (d.photos ?? []) as string[]) new Image().src = photoThumb(src, 300);
            const latest = latestCards.current?.find((item) => item.id === c.id) ?? c;
            cache.current.set(c.id, { ...d, distanceKm: latest.distanceKm, distanceM: latest.distanceM });
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
            {error ? "Не удалось открыть профиль" : cards.length ? (
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
            {error ?? (cards.length
              ? "Ты посмотрел всех, кто рядом. Создай встречу — и люди с похожими интересами найдут тебя сами."
              : hasLocation ? "Пока никого в радиусе 15 км. Подборка обновится при смене местоположения."
              : "Разреши геопозицию — Мося покажет людей поблизости и расстояние до них.")}
          </p>
        </div>
        <div className="foot">
          {!hasLocation && !error && <button className="btn o" onClick={allowGeo} disabled={geoBusy}>{geoBusy ? "Определяем местоположение…" : "Показать, кто рядом"}</button>}
          {error ? <button className="btn v" onClick={() => load()}>Попробовать снова</button> : <Link className="btn v" href="/create">
            <Ic n="plus" />
            Создать встречу
          </Link>}
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
          <button onClick={allowGeo} disabled={geoBusy}>{geoBusy ? "Определяем…" : "Разрешить"}</button>
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
