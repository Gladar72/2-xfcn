"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PersonView, type Person } from "@/components/people/PersonView";
import { mosyaSrc } from "@/components/brand/Mosya";
import { Ic } from "@/components/proto/ui";
import { PeopleFilterSheet } from "@/components/people/PeopleFilterSheet";
import { DEFAULT_PEOPLE_FILTERS, hasPeopleFilters, peopleFilterParams, readPeopleFilters, type PeopleFilters } from "@/lib/people/filters";
import { goBack } from "@/lib/nav/back";
import { watchMyLocation } from "@/lib/geo/client-location";
import { PersonPhoto, personPhotoUrl } from "@/components/people/PersonPhoto";
import { usePeopleVisitSeed } from "@/lib/people/use-visit-seed";

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
  gender?: string | null;
  lastActiveAt?: string | null;
}

/** Короткий профиль из карточки — показываем сразу, пока грузится полный. */
function quick(c: Card): Person {
  return {
    id: c.id,
    name: c.name,
    gender: c.gender,
    lastActiveAt: c.lastActiveAt,
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
 * выбранного города в случайном порядке; геопозиция нужна только для расстояний. Свайп вбок — следующий человек, тап по фото — другие
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
    // WebKit must not scroll the fixed app root when a filter sheet closes.
    root.scrollTop = 0;
    root.classList.add("people-mode");
    return () => root.classList.remove("people-mode");
  }, []);
  const visitSeed = usePeopleVisitSeed();
  const sp = useSearchParams();
  const start = sp.get("start");
  // Pin a clicked photo only for that navigation, not again after resuming the app.
  const pin = useRef({ id: start, visitSeed });
  if (pin.current.id !== start) pin.current = { id: start, visitSeed };
  const selected = pin.current.visitSeed === visitSeed ? start : null;
  const city = sp.get("city");
  const filters = useMemo(() => readPeopleFilters(sp) ?? DEFAULT_PEOPLE_FILTERS, [sp]);
  // Changing filters must discard old requests, selection and profile cache.
  return <div ref={container} className="people-deck"><Deck key={`${city}:${peopleFilterParams(filters)}:${selected}:${visitSeed}:${sp.get("mix") ?? ""}`} start={selected} cityFilter={city} filters={filters} /></div>;
}

function Deck({ start, cityFilter, filters }: { start: string | null; cityFilter: string | null; filters: PeopleFilters }) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ix, setIx] = useState(0);
  const [from, setFrom] = useState<1 | -1 | 0>(0);
  const cache = useRef(new Map<string, Person | null>());
  const profileRequests = useRef(new Map<string, AbortController>());
  useEffect(() => () => {
    for (const controller of profileRequests.current.values()) controller.abort();
    profileRequests.current.clear();
    cache.current.clear();
  }, []);
  const [, force] = useState(0);
  const [city, setCity] = useState(cityFilter ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtered = hasPeopleFilters(filters);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const moreRequest = useRef<AbortController | null>(null);
  const [shuffleSeed] = useState(() => crypto.randomUUID());
  const distanceRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const currentCard = useRef<string | null>(null);
  const swipeClickUntil = useRef(0);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  currentCard.current = cards?.[ix]?.id ?? null;
  const request = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const latestCards = useRef(cards);
  latestCards.current = cards;

  const queryUrl = useCallback((selected: string | null, offset = 0) => {
    const q = peopleFilterParams(filters);
    q.set("deck", "1");
    if (selected) q.set("start", selected);
    if (cityFilter) q.set("city", cityFilter);
    if (offset) q.set("offset", String(offset));
    q.set("seed", shuffleSeed);
    return `/api/people?${q}`;
  }, [cityFilter, filters, shuffleSeed]);

  const load = useCallback(() => {
    request.current?.abort();
    moreRequest.current?.abort();
    moreRequest.current = null;
    generation.current += 1;
    setMoreBusy(false);
    setMoreError(false);
    setNextOffset(null);
    const controller = new AbortController();
    request.current = controller;
    setCards(null);
    setError(null);
    return fetch(queryUrl(start), { signal: controller.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("people_unavailable");
        return r.json();
      })
      .then((d) => {
        if (controller.signal.aborted) return;
        const unique = [...new Map(((d.items ?? []) as Card[]).map(c => [c.id, c])).values()];
        const pinned = start ? unique.find(c => c.id === start) : null;
        const list = pinned ? [pinned, ...unique.filter(c => c.id !== start)] : unique;
        setCity(d.city ?? cityFilter ?? "");
        if (start && !pinned) {
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
        setIx(0);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Не удалось загрузить людей. Попробуй ещё раз.");
        setCards([]);
      });
  }, [start, queryUrl, cityFilter]);
  useEffect(() => {
    load();
    return () => { request.current?.abort(); moreRequest.current?.abort(); distanceRequest.current?.abort(); };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    const version = generation.current;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const response = await fetch(queryUrl(start, nextOffset), { signal: controller.signal, cache: "no-store" });
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
  }, [nextOffset, queryUrl, start]);
  useEffect(() => {
    if (cards && ix >= cards.length - 5 && nextOffset !== null && !moreError) void loadMore();
  }, [cards, ix, nextOffset, moreError, loadMore]);

  // GPS/focus may update distances, but must never rebuild the queue or rewind it.
  const refreshDistances = useCallback(() => {
    if (!loaded.current) { void load(); return; }
    const selected = currentCard.current;
    if (!selected) return; // Exhausted decks stay exhausted.
    distanceRequest.current?.abort();
    const controller = new AbortController();
    distanceRequest.current = controller;
    void fetch(queryUrl(selected), { signal: controller.signal, cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("people_unavailable"); return r.json(); })
      .then(d => {
        if (controller.signal.aborted) return;
        const fresh = new Map<string, Card>(((d.items ?? []) as Card[]).map(c => [c.id, c]));
        setCards(previous => {
          const updated = previous?.map(c => {
            const next = fresh.get(c.id);
            if (!next) return c;
            const cached = cache.current.get(c.id);
            if (cached) cache.current.set(c.id, { ...cached, distanceKm: next.distanceKm, distanceM: next.distanceM });
            return { ...c, distanceKm: next.distanceKm, distanceM: next.distanceM };
          }) ?? null;
          latestCards.current = updated;
          return updated;
        });
      }).catch(() => {});
  }, [load, queryUrl]);
  useEffect(() => watchMyLocation(refreshDistances), [refreshDistances]);

  // Заранее подгружаем соседей: следующий профиль и его фото уже готовы.
  useEffect(() => {
    if (!cards) return;
    // Keep a small window of full profiles, not every photo set ever swiped.
    const retained = new Set(cards.slice(Math.max(0, ix - 12), ix + 12).map(c => c.id));
    for (const id of cache.current.keys()) if (!retained.has(id)) cache.current.delete(id);
    const neighbours = [cards[ix], cards[ix + 1], cards[ix + 2], cards[ix - 1]];
    const needed = new Set(neighbours.flatMap(c => c ? [c.id] : []));
    for (const [id, controller] of profileRequests.current) {
      if (!needed.has(id)) {
        controller.abort();
        profileRequests.current.delete(id);
        cache.current.delete(id);
      }
    }
    for (const c of neighbours) {
      if (!c || cache.current.has(c.id)) continue;
      cache.current.set(c.id, null);
      const controller = new AbortController();
      profileRequests.current.set(c.id, controller);
      if (c.avatarUrl) new Image().src = personPhotoUrl(c.avatarUrl);
      fetch(`/api/users/${c.id}`, { signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error("profile_unavailable"); return r.json(); })
        .then((d) => {
          if (!d.error && d.id === c.id && !controller.signal.aborted) {
            // Neighbours need their cover only; the active gallery loads its other photos.
            for (const src of ((d.photos ?? []) as string[]).slice(0, 1)) new Image().src = personPhotoUrl(src);
            const latest = latestCards.current?.find((item) => item.id === c.id) ?? c;
            cache.current.set(c.id, { ...d, city: latest.city, distanceKm: latest.distanceKm, distanceM: latest.distanceM });
            // Prefetched neighbours should not repaint the card under the finger.
            if (currentCard.current === c.id) force((n) => n + 1);
          }
        })
        .catch(() => { if (!controller.signal.aborted) cache.current.delete(c.id); })
        .finally(() => { if (profileRequests.current.get(c.id) === controller) profileRequests.current.delete(c.id); });
    }
  }, [cards, ix]);

  function changeFilters(next: PeopleFilters) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const q = peopleFilterParams(next);
    if (city) q.set("city", city);
    q.set("mix", crypto.randomUUID());
    router.replace(`/people${q.size ? `?${q}` : ""}`, { scroll: false });
  }
  const toolbar = <>
    <div className={`people-tools ${cards?.[ix] ? "over-photo" : ""}`}>
      {!cards?.[ix] && <button className="rb gl" onClick={() => goBack(router, "/feed")} aria-label="Назад"><Ic n="back" /></button>}
      <button className={`rb ${cards?.[ix] ? "glass" : "gl"} people-filter-trigger`} onClick={() => setFiltersOpen(true)} aria-label="Фильтры" aria-haspopup="dialog" aria-expanded={filtersOpen}>
        <Ic n="filter" />{filtered && <span className="people-filter-dot" aria-label="Фильтры включены" />}
      </button>
    </div>
    <PeopleFilterSheet open={filtersOpen} value={filters} onClose={() => setFiltersOpen(false)} onApply={changeFilters} />
  </>;

  if (cards === null)
    return (
      <section className="scr pr aurora fade" data-id="person" data-transition="deck">
        {toolbar}
        <div className="gal">
          <div className="sk" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
        </div>
      </section>
    );

  const c = cards[ix];
  if (!c)
    return (
      <section className="scr aurora in" data-id="deck-end" data-transition="deck">
        {toolbar}
        <div className="done">
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
                Пока никого<br /><em>не нашли</em>
              </>
            )}
          </h1>
          <p>
            {error ?? (moreError ? "Попробуй ещё раз — продолжим с той же анкеты."
              : moreBusy || nextOffset !== null ? "Сейчас покажем следующие анкеты."
              : cards.length ? "Ты посмотрел всех по выбранным фильтрам. Можно изменить условия или создать встречу."
              : "Попробуй расширить возраст или выбрать другие интересы.")}

          </p>
        </div>
        <div className="foot">
          {moreError && <button className="btn v" onClick={() => void loadMore()}>Загрузить ещё</button>}
          {filtered && <button className="btn v" onClick={() => changeFilters(DEFAULT_PEOPLE_FILTERS)}>Сбросить фильтры</button>}
          <button className="btn o" onClick={() => setFiltersOpen(true)}>Изменить фильтры</button>
          {error ? <button className="btn v" onClick={() => load()}>Попробовать снова</button> : !filtered && <Link className="btn v" href="/create">
            <Ic n="plus" />
            Создать встречу
          </Link>}
        </div>
      </section>
    );

  const next = cards[ix + 1];
  const cached = cache.current.get(c.id);
  return (
    <div className="people-stack" style={{ display: "contents" }}
      onTouchStartCapture={e => {
        swipeClickUntil.current = 0;
        const touch = e.touches[0];
        touchOrigin.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchMoveCapture={e => {
        const start = touchOrigin.current;
        const touch = e.touches[0];
        if (start && touch && Math.max(Math.abs(touch.clientX - start.x), Math.abs(touch.clientY - start.y)) > 10) {
          swipeClickUntil.current = performance.now() + 500;
        }
      }}
      onClickCapture={e => {
        // iOS may deliver the old gesture's compatibility click after the card
        // unmounts. Keep this guard outside PersonView so it survives that swap.
        if (e.detail !== 0 && performance.now() < swipeClickUntil.current) { e.preventDefault(); e.stopPropagation(); }
      }}>
      {toolbar}
      {/* Под карточкой видно следующего — как стопка в Tinder. */}
      <div className="deck-under">
        {next?.avatarUrl && (
          <PersonPhoto key={next.id} src={next.avatarUrl} />
        )}
      </div>
      <PersonView
      key={c.id}
      id={c.id}
      initial={cached ?? quick(c)}
      deck={{
        from,
        onSwipe: (dir) => {
          swipeClickUntil.current = performance.now() + 500;
          setFrom(dir);
          setIx((i) => i + 1);
        },
      }}
      />
    </div>
  );
}
