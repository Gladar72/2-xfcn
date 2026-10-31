"use client";

import { useGuide } from "@/lib/mosya/guide";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { openRoute } from "@/lib/maps/route";
import { photoThumb } from "@/lib/photos/thumb";
import { Ic, Sheet } from "@/components/proto/ui";
import { goBack } from "@/lib/nav/back";
import { EventsMap, categoryIcon3d, eventTimeLabel, type EventsMapHandle, type MapEventItem } from "@/components/map/EventsMap";
import { BIZ_CATEGORIES, BIZ_OTHER, bizCategoryCounts, bizCategoryIcon, matchesBizCategory } from "@/lib/events/biz-categories";
import { ApiReadError, getJson } from "@/lib/http/get-json";

const PAGE_SIZE = 20; // показ длинного списка кластера порциями, а не всё разом

export default function MapPage() {
  return (
    <Suspense>
      <MapPageContent />
    </Suspense>
  );
}

function MapPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Все параметры (city/categories/date/timeOfDay/costType/gender/
  // ageMin/ageMax) просто пробрасываем как есть — /api/events/map
  // понимает тот же набор фильтров, что и экран поиска (см. кнопку
  // "Показать на карте" на /search).
  const forwardedParams = searchParams.toString();

  const [events, setEvents] = useState<MapEventItem[]>([]);
  const [selected, setSelected] = useState<MapEventItem[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // «Карта заведений» — открывается из раздела «Для бизнеса».
  const bizOnly = searchParams.get("business") === "only";
  useGuide(bizOnly ? "bizmap" : "map", { force: bizOnly });
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);
  const mapRef = useRef<EventsMapHandle>(null);
  // Реальный город, которым пользуется API (см. ниже) — не то же самое,
  // что city из URL: при прямом переходе на /map (не через кнопку
  // "Показать на карте" на /search) в URL города вообще нет, и сервер сам
  // берёт город из профиля пользователя. Раньше карта в этом случае не
  // знала, к какому городу переехать, и оставалась на запасном центре.
  const [resolvedCity, setResolvedCity] = useState<string | undefined>(searchParams.get("city") ?? undefined);

  const request = useRef<AbortController | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function load() {
    request.current?.abort();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setSelected(null);
    const query = forwardedParams ? `?${forwardedParams}` : "";
    async function attempt(retried = false) {
      try {
        const data = await getJson<{ items: MapEventItem[]; city?: string }>(`/api/events/map${query}`, controller.signal);
        if (controller.signal.aborted) return;
        setEvents(data.items ?? []);
        setResolvedCity(data.city ?? undefined);
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        // Retry transient failures only. Keep the loading state during the delay;
        // a new filter or unmount cancels both this request and its scheduled retry.
        if (!retried && (!(err instanceof ApiReadError) || err.status >= 500 || err.status === 200)) {
          retryTimer.current = setTimeout(() => { void attempt(true); }, 800);
          return;
        }
        setError(err instanceof ApiReadError && err.code === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить карту.");
        setLoading(false);
      }
    }
    void attempt();
  }

  useEffect(() => {
    load();
    return () => {
      request.current?.abort();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forwardedParams]);

  // Если открытый кластер собран из НЕСКОЛЬКИХ разных мест — предлагаем
  // приблизить карту к его границам (п.6 задания на кластеризацию).
  // Если все встречи ровно в одном месте — приближать нечего, кнопка не нужна.
  const distinctPlaceCount = useMemo(() => {
    if (!selected) return 0;
    // Более широкий порог, чем технический "разъезд" одинаковых координат
    // на карте (JITTER_METERS в EventsMap.tsx, ~4м) — иначе кнопка могла бы
    // появляться даже для встреч, которые на самом деле в одном месте.
    // 4 знака ≈ 11м — заметно шире жителя разъезда, но всё ещё отличает
    // по-настоящему разные адреса.
    const keys = new Set(selected.map((e) => `${e.latitude.toFixed(4)},${e.longitude.toFixed(4)}`));
    return keys.size;
  }, [selected]);

  // Переход со страницы встречи (нажали на мини-карту): /map?focus=<id> —
  // приближаем карту к встрече и сразу открываем её карточку.
  const focusId = searchParams.get("focus");
  const focusDone = useRef(false);
  useEffect(() => { focusDone.current = false; }, [focusId]);
  useEffect(() => {
    if (!focusId || focusDone.current || events.length === 0) return;
    const target = events.find((e) => e.id === focusId);
    if (!target) return;
    focusDone.current = true;
    setSelected([target]);
    setVisibleCount(PAGE_SIZE);
    // Карта могла ещё не загрузиться или сама подстроиться под город — повторяем перелёт.
    const fly = () => mapRef.current?.fitBounds([[target.longitude, target.latitude]]);
    fly();
    const t1 = setTimeout(fly, 700);
    const t2 = setTimeout(fly, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [focusId, events]);

  function handleSelect(items: MapEventItem[]) {
    setSelected(items);
    setVisibleCount(PAGE_SIZE);
  }

  async function handleLocate() {
    if (!mapRef.current || locating) return;
    setLocating(true);
    setLocateFailed(false);
    const ok = await mapRef.current.locate();
    setLocating(false);
    if (!ok) {
      setLocateFailed(true);
      setTimeout(() => setLocateFailed(false), 3000);
    }
  }

  function handleZoomToGroup() {
    if (!selected || !mapRef.current) return;
    mapRef.current.fitBounds(selected.map((e) => [e.longitude, e.latitude] as [number, number]));
  }

  const dateNow = searchParams.get("date");
  function setDate(d: string | null) {
    const q = new URLSearchParams(forwardedParams);
    if (d) q.set("date", d);
    else q.delete("date");
    router.replace(`/map${q.toString() ? `?${q}` : ""}`);
  }
  const [liveOnly, setLiveOnly] = useState(false);
  const base = bizOnly ? events.filter((e) => e.isBusiness) : events;
  const timed = liveOnly ? base.filter((e) => eventTimeLabel(e).live) : base;
  // Карта заведений: категория (кафе, бары, концерты…) — фильтруем сразу, без перезагрузки.
  // Состояние, а не адрес: смена адреса перезагрузила бы карту.
  const [bizCatState, setBizCatState] = useState<string | null>(searchParams.get("cat"));
  const bizCat = bizOnly ? bizCatState : null;
  const bizCounts = useMemo(() => (bizOnly ? bizCategoryCounts(timed) : []), [bizOnly, timed]);
  const bizCatInfo = bizCat ? [...BIZ_CATEGORIES, BIZ_OTHER].find((c) => c.key === bizCat) ?? null : null;
  const shown = bizCat ? timed.filter((e) => matchesBizCategory(e, bizCat)) : timed;
  const [catSheet, setCatSheet] = useState(false);
  function setBizCat(k: string | null) {
    setSelected(null);
    setBizCatState(k);
  }
  const carousel = (selected ?? shown).slice(0, visibleCount);

  return (
    <section className="scr fade" data-id="map">
      <div className="map" style={{ cursor: "default" }}>
        {error ? (
          <div className="empty" style={{ position: "absolute", inset: 0, alignContent: "center" }}>
            <b>{error}</b>
            {error !== "Сначала заверши регистрацию." && (
              <button className="btn v" style={{ width: "auto", padding: "0 24px" }} onClick={() => load()}>
                Попробовать снова
              </button>
            )}
          </div>
        ) : loading && events.length === 0 ? (
          <div className="done" style={{ position: "absolute", inset: 0, alignContent: "center", paddingTop: 0 }}>
            <div className="burst wait">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mosya/mosya_phone.webp" alt="" />
            </div>
            <p>Загружаем карту…</p>
          </div>
        ) : (
          <EventsMap ref={mapRef} events={shown} onSelect={handleSelect} city={resolvedCity} />
        )}
      </div>

      <div className="zm">
        <button className="rb gl" onClick={() => mapRef.current?.zoomIn()} aria-label="Приблизить">
          <Ic n="plus" c="s" />
        </button>
        <button className="rb gl" onClick={() => mapRef.current?.zoomOut()} aria-label="Отдалить">
          <svg className="ic s" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="mtop">
        <div className="search">
          {bizOnly ? (
            <button className="rb gl" onClick={() => goBack(router, "/business")} aria-label="Назад" style={{ width: 50, height: 50, flex: "none" }}>
              <Ic n="back" />
            </button>
          ) : null}
          <Link className="sfield gl" href={bizOnly ? "/business" : "/search"}>
            <Ic n="search" c="s" />
            {bizOnly
              ? `Заведения${resolvedCity ? ` · ${resolvedCity}` : ""}`
              : resolvedCity
                ? `Что рядом? · ${resolvedCity}`
                : "Что рядом?"}
          </Link>
          {bizOnly ? (
            <button className="rb k" onClick={() => setCatSheet(true)} aria-label="Категории" style={{ width: 50, height: 50 }}>
              <Ic n="filter" />
            </button>
          ) : (
            <Link className="rb k" href="/search?filters=1" aria-label="Фильтры" style={{ width: 50, height: 50 }}>
              <Ic n="filter" />
            </Link>
          )}
        </div>
        <div className="chipsrow">
          <button
            className={`chip ${liveOnly ? "on" : "gl"}`}
            onClick={() => {
              setLiveOnly(true);
              setDate("today");
            }}
          >
            Сейчас
          </button>
          {(
            [
              ["today", "Сегодня"],
              ["tomorrow", "Завтра"],
              ["weekend", "На выходных"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              className={`chip ${!liveOnly && dateNow === k ? "on" : "gl"}`}
              onClick={() => {
                setLiveOnly(false);
                setDate(dateNow === k ? null : k);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {bizOnly && (bizCounts.length > 0 || bizCatInfo) && (
          <div className="cats" style={{ padding: "0 20px 4px" }}>
            <button className={`cat ${!bizCat ? "on" : "gl"}`} style={{ paddingLeft: 16 }} onClick={() => setBizCat(null)}>
              Все
            </button>
            {(bizCatInfo && !bizCounts.some((x) => x.cat.key === bizCat) ? [{ cat: bizCatInfo, count: 0 }, ...bizCounts] : bizCounts).map(({ cat, count }) => (
              <button key={cat.key} className={`cat ${bizCat === cat.key ? "on" : "gl"}`} onClick={() => setBizCat(bizCat === cat.key ? null : cat.key)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bizCategoryIcon(cat)} alt="" />
                {cat.label}
                <span style={{ opacity: 0.55, marginLeft: 2 }}>{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Sheet open={catSheet} onClose={() => setCatSheet(false)}>
        <h2 className="t">Что ищем?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[...BIZ_CATEGORIES, BIZ_OTHER].map((cat) => {
            const count = bizCounts.find((x) => x.cat.key === cat.key)?.count ?? 0;
            return (
              <button
                key={cat.key}
                className={`cat ${bizCat === cat.key ? "on" : "gl"}`}
                style={{ height: 56, opacity: count ? 1 : 0.45, justifyContent: "flex-start" }}
                onClick={() => {
                  setBizCat(bizCat === cat.key ? null : cat.key);
                  setCatSheet(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bizCategoryIcon(cat)} alt="" />
                <span style={{ flex: 1, textAlign: "left", lineHeight: 1.2 }}>{cat.label}</span>
                <span style={{ opacity: 0.55 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <button
          className="btn v"
          onClick={() => {
            setBizCat(null);
            setCatSheet(false);
          }}
        >
          Показать все · {timed.length}
        </button>
      </Sheet>
      {bizOnly && !error && !bizCat && (
        <div className="bizmap-note gl" style={bizCounts.length ? { top: "calc(var(--top) + 172px)" } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/markers/v2/pin-business.png" alt="" />
          <span>
            Здесь только события заведений{resolvedCity ? ` в городе ${resolvedCity}` : " твоего города"} — кафе, бары, студии.
          </span>
        </div>
      )}

      <button className="rb gl locate" onClick={handleLocate} aria-label="Где я">
        <Ic n="nav" />
      </button>
      <Link className="rb locate2" href="/create" aria-label="Создать встречу">
        <Ic n="plus" />
      </Link>
      {selected ? (
        <button className="pill gl listb" onClick={() => setSelected(null)}>
          <Ic n="close" c="xs" />
          {selected.length > 1 ? `Здесь ${selected.length} · показать все` : "Показать все"}
        </button>
      ) : (
        <Link className="pill gl listb" href={bizOnly ? "/business" : "/search"}>
          <Ic n="filter" c="xs" />
          Списком · {shown.length}
        </Link>
      )}
      {selected && distinctPlaceCount > 1 && (
        <button className="pill gl" style={{ position: "absolute", left: 20, bottom: "calc(var(--bot) + 196px)", zIndex: 5, height: 40 }} onClick={handleZoomToGroup}>
          Приблизить
        </button>
      )}
      {locateFailed && (
        <div className="note gl" style={{ position: "absolute", left: 20, right: 84, bottom: "calc(var(--bot) + 196px)", zIndex: 6 }}>
          Не удалось определить, где ты. Разреши доступ к геопозиции для Telegram.
        </div>
      )}

      {!loading && !error && !selected && shown.length === 0 && bizCatInfo && (
        <div className="note gl" style={{ position: "absolute", left: 20, right: 20, bottom: "calc(var(--bot) + 120px)", zIndex: 6, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ flex: 1 }}>«{bizCatInfo.label}» — {dateNow || liveOnly ? "на эти дни" : "пока"} ничего нет.</span>
          <button className="chip on" onClick={() => setBizCat(null)}>
            Все
          </button>
        </div>
      )}
      {!loading && !error && !selected && shown.length === 0 && !bizCatInfo && (dateNow || liveOnly) && (
        <div className="note gl" style={{ position: "absolute", left: 20, right: 20, bottom: "calc(var(--bot) + 120px)", zIndex: 6, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ flex: 1 }}>
            {liveOnly
              ? "Прямо сейчас ничего не идёт."
              : dateNow === "today"
                ? "На сегодня встреч пока нет."
                : dateNow === "tomorrow"
                  ? "На завтра встреч пока нет."
                  : dateNow === "weekend"
                    ? "На выходные встреч пока нет."
                    : "На этот день встреч нет."}
          </span>
          <button
            className="chip on"
            onClick={() => {
              setLiveOnly(false);
              setDate(null);
            }}
          >
            Все дни
          </button>
        </div>
      )}

      <div className="mcar">
        {carousel.map((e) => (
          <Link key={e.id} className="mcard gl" href={e.id.startsWith("city:") ? `/city/${e.id.slice(5)}` : `/events/${e.id}`}>
            {e.organizer?.avatarUrl && !e.organizerHidden ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(e.organizer.avatarUrl, 144)} alt="" />
            ) : (
              <span className="mcgfx gfx">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={categoryIcon3d(e)} alt="" />
              </span>
            )}
            <div className="i">
              <b>{e.title}</b>
              <span>
                {eventTimeLabel(e).live ? "идёт сейчас" : `${dayShort(e.eventDate)}, ${e.eventTime.slice(0, 5)}`} ·{" "}
                {e.organizerHidden ? "анонимно · место после одобрения" : e.placeName ?? e.address?.replace(/^Россия,\s*/, "") ?? ""}
              </span>
              <span>{e.id.startsWith("city:") ? "событие города" : e.seatsLeft > 0 ? `свободно ${e.seatsLeft}` : "мест нет"}</span>
            </div>
            {!e.organizerHidden && (
              <span
                className="sm"
                role="button"
                aria-label="Маршрут"
                onClick={(ev) => {
                  ev.preventDefault();
                  openRoute(e.latitude, e.longitude);
                }}
              >
                <Ic n="route" c="xs" />
              </span>
            )}
          </Link>
        ))}
        {selected && visibleCount < selected.length && (
          <button className="mcard gl" style={{ width: 160, justifyContent: "center" }} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Ещё {selected.length - visibleCount}
          </button>
        )}
      </div>
    </section>
  );
}

function dayShort(dateIso: string) {
  const d = new Date(dateIso);
  const t = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 864e5);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}
