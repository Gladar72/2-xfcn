"use client";

import { useGuide } from "@/lib/mosya/guide";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { openRoute } from "@/lib/maps/route";
import { photoThumb } from "@/lib/photos/thumb";
import { Ic } from "@/components/proto/ui";
import { EventsMap, eventTimeLabel, markerIconFor, type EventsMapHandle, type MapEventItem } from "@/components/map/EventsMap";

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
  useGuide("map");
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);
  const mapRef = useRef<EventsMapHandle>(null);
  // Реальный город, которым пользуется API (см. ниже) — не то же самое,
  // что city из URL: при прямом переходе на /map (не через кнопку
  // "Показать на карте" на /search) в URL города вообще нет, и сервер сам
  // берёт город из профиля пользователя. Раньше карта в этом случае не
  // знала, к какому городу переехать, и оставалась на запасном центре.
  const [resolvedCity, setResolvedCity] = useState<string | undefined>(searchParams.get("city") ?? undefined);

  function load(isRetry = false) {
    setLoading(true);
    setError(null);
    const query = forwardedParams ? `?${forwardedParams}` : "";
    fetch(`/api/events/map${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          // "Не удалось загрузить карту" бывает из-за редких кратковременных
          // сбоев соединения с базой — один автоматический повтор решает
          // подавляющее большинство таких случаев без участия пользователя.
          if (data.error !== "city_required" && !isRetry) {
            setTimeout(() => load(true), 800);
            return;
          }
          setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить карту.");
          return;
        }
        setEvents(data.items ?? []);
        if (data.city) setResolvedCity(data.city);
      })
      .catch(() => {
        if (!isRetry) {
          setTimeout(() => load(true), 800);
          return;
        }
        setError("Проблема с соединением.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
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
  const shown = liveOnly ? events.filter((e) => eventTimeLabel(e).live) : events;
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
          <Link className="sfield gl" href="/search">
            <Ic n="search" c="s" />
            {resolvedCity ? `Что рядом? · ${resolvedCity}` : "Что рядом?"}
          </Link>
          <Link className="rb k" href="/search?filters=1" aria-label="Фильтры" style={{ width: 50, height: 50 }}>
            <Ic n="filter" />
          </Link>
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
      </div>

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
        <Link className="pill gl listb" href="/search">
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

      <div className="mcar">
        {carousel.map((e) => (
          <Link key={e.id} className="mcard gl" href={`/events/${e.id}`}>
            {e.organizer?.avatarUrl && !e.organizerHidden ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoThumb(e.organizer.avatarUrl, 144)} alt="" />
            ) : (
              <span className="mcgfx gfx">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={markerIconFor(e)} alt="" />
              </span>
            )}
            <div className="i">
              <b>{e.title}</b>
              <span>
                {eventTimeLabel(e).live ? "идёт сейчас" : `${dayShort(e.eventDate)}, ${e.eventTime.slice(0, 5)}`} ·{" "}
                {e.organizerHidden ? "анонимно · место после одобрения" : e.placeName ?? e.address?.replace(/^Россия,\s*/, "") ?? ""}
              </span>
              <span>{e.seatsLeft > 0 ? `свободно ${e.seatsLeft}` : "мест нет"}</span>
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
