"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EventsMap, type EventsMapHandle, type MapEventItem } from "@/components/map/EventsMap";

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
    const keys = new Set(selected.map((e) => `${e.latitude.toFixed(4)},${e.longitude.toFixed(4)}`));
    return keys.size;
  }, [selected]);

  function handleSelect(items: MapEventItem[]) {
    setSelected(items);
    setVisibleCount(PAGE_SIZE);
  }

  function handleZoomToGroup() {
    if (!selected || !mapRef.current) return;
    mapRef.current.fitBounds(selected.map((e) => [e.longitude, e.latitude] as [number, number]));
  }

  return (
    <div className="relative h-[calc(100vh-5rem)]">
      {resolvedCity && (
        <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-pill bg-white px-4 py-1.5 text-sm font-medium text-ink-900 shadow-card">
          📍 {resolvedCity}
        </div>
      )}
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          {error !== "Сначала заверши регистрацию." && (
            <button
              onClick={() => load()}
              className="rounded-pill bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-cta active:scale-95"
            >
              Попробовать снова
            </button>
          )}
        </div>
      ) : loading && events.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-ink-600">Загрузка карты...</div>
      ) : (
        <EventsMap ref={mapRef} events={events} onSelect={handleSelect} city={resolvedCity} />
      )}

      {selected && (
        <div
          className="fixed inset-x-0 bottom-20 z-50 max-h-[60vh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-card"
          role="dialog"
          aria-label={`Встречи: ${selected.length}`}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" onClick={() => setSelected(null)} />
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-title truncate">
              {selected.length > 1
                ? `Встречи здесь (${selected.length})`
                : selected[0]?.placeName || selected[0]?.address || "Место встречи"}
            </h2>
            {distinctPlaceCount > 1 && (
              <button
                onClick={handleZoomToGroup}
                className="shrink-0 rounded-pill bg-lavender-100 px-3 py-1.5 text-xs font-medium text-accent"
              >
                Приблизить на карте
              </button>
            )}
          </div>
          <div className="space-y-2">
            {selected.slice(0, visibleCount).map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="flex items-center gap-3 rounded-card bg-background p-3"
              >
                <span className="text-xl">{event.category?.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
                  <p className="truncate text-xs text-ink-600">
                    {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
                  </p>
                  {(event.placeName || event.address) && (
                    <p className="truncate text-xs text-ink-400">{event.placeName || event.address}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
          {visibleCount < selected.length && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="mt-3 w-full rounded-pill bg-lavender-50 py-2.5 text-sm font-medium text-accent"
            >
              Показать ещё ({selected.length - visibleCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
