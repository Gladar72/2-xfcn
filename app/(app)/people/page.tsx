"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PersonView, type Person } from "@/components/people/PersonView";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic, Sheet } from "@/components/proto/ui";
import { CityWheel } from "@/components/proto/pickers";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";
import { goBack } from "@/lib/nav/back";
import { watchMyLocation, sendMyLocation } from "@/lib/geo/client-location";
import { say } from "@/lib/mosya/peek";
import { photoThumb } from "@/lib/photos/thumb";

interface Card {
  id: string;
  name: string;
  age: number;
  city?: string;
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
    city: c.city,
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
 * выбранного города; геопозиция определяет порядок и расстояния. Свайп вбок — следующий человек, тап по фото — другие
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
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = container.current?.closest(".P");
    if (!root) return;
    // WebKit must not scroll the fixed app root when the city sheet closes.
    root.scrollTop = 0;
    root.classList.add("people-mode");
    return () => root.classList.remove("people-mode");
  }, []);
  const sp = useSearchParams();
  const start = sp.get("start");
  const city = sp.get("city");
  const gender = sp.get("gender") === "male" ? "male" : sp.get("gender") === "female" ? "female" : "all";
  // Changing filters must discard old requests, selection and profile cache.
  return <div ref={container} className="people-deck"><Deck key={`${city}:${gender}:${start}`} start={start} cityFilter={city} gender={gender} /></div>;
}

function Deck({ start, cityFilter, gender }: { start: string | null; cityFilter: string | null; gender: string }) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ix, setIx] = useState(0);
  const [from, setFrom] = useState<1 | -1 | 0>(0);
  const cache = useRef(new Map<string, Person | null>());
  const [, force] = useState(0);
  const [city, setCity] = useState(cityFilter ?? "");
  const [cityOpen, setCityOpen] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const moreRequest = useRef<AbortController | null>(null);
  const pageSeed = useRef(start);
  const generation = useRef(0);
  const pagination = useRef(nextOffset);
  pagination.current = nextOffset;
  const [hasLocation, setHasLocation] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const currentCard = useRef<string | null>(null);
  currentCard.current = cards?.[ix]?.id ?? null;
  const request = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const latestCards = useRef(cards);
  latestCards.current = cards;

  const queryUrl = useCallback((selected: string | null, offset = 0) => {
    const q = new URLSearchParams({ deck: "1" });
    if (selected) q.set("start", selected);
    if (cityFilter) q.set("city", cityFilter);
    if (gender !== "all") q.set("gender", gender);
    if (offset) q.set("offset", String(offset));
    return `/api/people?${q}`;
  }, [cityFilter, gender]);

  const load = useCallback((refresh = false) => {
    refresh = refresh && loaded.current;
    const previousOffset = pagination.current;
    const previousSeed = pageSeed.current;
    request.current?.abort();
    moreRequest.current?.abort();
    moreRequest.current = null;
    generation.current += 1;
    setMoreBusy(false);
    setMoreError(false);
    setNextOffset(null);
    const controller = new AbortController();
    request.current = controller;
    if (!refresh) setCards(null);
    setError(null);
    const selected = refresh ? currentCard.current : start;
    pageSeed.current = selected;
    return fetch(queryUrl(selected), { signal: controller.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("people_unavailable");
        return r.json();
      })
      .then((d) => {
        if (controller.signal.aborted) return;
        const list = (d.items ?? []) as Card[];
        setCity(d.city ?? cityFilter ?? "");
        setHasLocation(d.meHasLocation === true);
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
        setNextOffset(typeof d.nextOffset === "number" ? d.nextOffset : null);
        setCards(list);
        setIx(i > 0 ? i : 0);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        if (refresh) { pageSeed.current = previousSeed; setNextOffset(previousOffset); return; }
        setError("Не удалось загрузить людей. Попробуй ещё раз.");
        setCards([]);
      });
  }, [start, queryUrl, cityFilter]);
  useEffect(() => {
    load();
    return () => { request.current?.abort(); moreRequest.current?.abort(); };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    const version = generation.current;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const response = await fetch(queryUrl(pageSeed.current, nextOffset), { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("people_unavailable");
      const d = await response.json();
      if (controller.signal.aborted || version !== generation.current) return;
      setCards((current) => {
        const seen = new Set(current?.map((c) => c.id));
        const additions = ((d.items ?? []) as Card[]).filter((c) => !seen.has(c.id) && !!seen.add(c.id));
        const combined = [...(current ?? []), ...additions];
        latestCards.current = combined;
        return combined;
      });
      setNextOffset(typeof d.nextOffset === "number" && d.nextOffset > nextOffset ? d.nextOffset : null);
    } catch {
      if (!controller.signal.aborted) setMoreError(true);
    } finally {
      if (moreRequest.current === controller) { moreRequest.current = null; setMoreBusy(false); }
    }
  }, [nextOffset, queryUrl]);
  useEffect(() => {
    if (cards && ix >= cards.length - 5 && nextOffset !== null && !moreError) void loadMore();
  }, [cards, ix, nextOffset, moreError, loadMore]);

  useEffect(() => watchMyLocation(() => { void load(true); }), [load]);

  async function allowGeo() {
    setGeoBusy(true);
    const ok = await sendMyLocation();
    setGeoBusy(false);
    if (ok) {
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
            cache.current.set(c.id, { ...d, city: latest.city, distanceKm: latest.distanceKm, distanceM: latest.distanceM });
            force((n) => n + 1);
          }
        })
        .catch(() => {});
    }
  }, [cards, ix]);

  function changeFilters(nextCity: string, nextGender = gender) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const q = new URLSearchParams();
    if (nextCity) q.set("city", nextCity);
    if (nextGender !== "all") q.set("gender", nextGender);
    router.replace(`/people${q.size ? `?${q}` : ""}`, { scroll: false });
  }
  const toolbar = <>
    <div className="people-controls">
      <button className="people-city" onClick={() => setCityOpen(true)} aria-label="Выбрать город">
        <Ic n="pin" c="s" /><span>{city || "Выбрать город"}</span><Ic n="down" c="s" />
      </button>
      <div className="people-filters" role="group" aria-label="Кого показывать">
        {([["all", "Все"], ["male", "Мужчины"], ["female", "Женщины"]] as const).map(([value, label]) =>
          <button key={value} aria-pressed={gender === value} onClick={() => changeFilters(city, value)}>{label}</button>)}
      </div>
      <div className="people-scope">
        {hasLocation ? "Весь город · сначала ближайшие" : <button onClick={allowGeo} disabled={geoBusy}>{geoBusy ? "Определяем расстояние…" : "Весь город · показать расстояние"}</button>}
      </div>
    </div>
    <Sheet open={cityOpen} onClose={() => setCityOpen(false)}>
      <h2 className="t">Выбери <em>город</em></h2>
      {cityOpen && <CityWheel value={city} cities={RUSSIAN_CITIES} onPick={(selected) => { setCityOpen(false); changeFilters(selected); }} />}
    </Sheet>
  </>;

  if (cards === null)
    return (
      <section className="scr pr aurora fade" data-id="person">
        {toolbar}
        <div className="gal">
          <div className="sk" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
        </div>
      </section>
    );

  const c = cards[ix];
  if (!c)
    return (
      <section className="scr aurora in" data-id="deck-end">
        {toolbar}
        <div className="bar-top" style={{ padding: "0 20px" }}>
          <button className="rb gl" onClick={() => goBack(router, "/feed")} aria-label="Назад">
            <Ic n="back" />
          </button>
          <span />
        </div>
        <div className="done" style={{ paddingTop: 205 }}>
          <div className="burst">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mosyaSrc("sit")} alt="" />
          </div>
          <h1 className="t">
            {error ? "Не удалось открыть профиль" : moreError ? "Не удалось загрузить анкеты" : moreBusy || nextOffset !== null ? "Загружаем людей…" : cards.length ? (
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
            {error ?? (moreError ? "Попробуй ещё раз — продолжим с той же анкеты."
              : moreBusy || nextOffset !== null ? "Сейчас покажем следующие анкеты."
              : cards.length ? "Ты посмотрел всех по выбранным фильтрам. Можно сменить город или создать встречу."
              : "В выбранном городе пока нет анкет по этим фильтрам. Измени фильтр или выбери другой город.")}

          </p>
        </div>
        <div className="foot">
          {moreError && <button className="btn v" onClick={() => void loadMore()}>Загрузить ещё</button>}
          <button className="btn o" onClick={() => setCityOpen(true)}>Сменить город</button>
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
      {toolbar}
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
    </>
  );
}
