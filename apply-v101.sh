mkdir -p "components/map"
cat > "components/map/EventsMap.tsx" << 'ENDOFFILE'
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadYandexMaps } from "@/lib/maps/load-yandex-maps";
import { searchAddress } from "@/lib/maps/forward-geocode";

export interface MapEventItem {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  latitude: number;
  longitude: number;
  placeName: string | null;
  address: string | null;
  seatsLeft: number;
  category: { slug: string; name: string; emoji: string | null } | null;
}

export interface EventsMapHandle {
  /** Приближает карту так, чтобы в кадре поместились все переданные точки. */
  fitBounds: (points: [number, number][]) => void;
}

interface EventsMapProps {
  events: MapEventItem[];
  onSelect: (events: MapEventItem[]) => void;
  /**
   * Город из фильтра — карта переезжает туда, даже если в этом городе
   * пока нет ни одной встречи (раньше в таком случае карта оставалась на
   * запасном центре — Тюмени — независимо от выбранного города).
   */
  city?: string;
}

const DEFAULT_CENTER: [number, number] = [65.534328, 57.152985]; // Тюмень, запасной центр
// Пиксельный радиус группировки — ориентир из задания на кластеризацию
// (не радиус географического поиска, а расстояние на экране в CSS-пикселях).
const CLUSTER_GRID_SIZE = 60;
// Точность округления координат для "одного и того же места" — 5 знаков
// после запятой ≈ 1.1 метра. Раньше было 4 знака (≈11м) — этого хватало,
// чтобы случайно объединить два РАЗНЫХ соседних здания в один
// нераскрывающийся кружок даже на максимальном зуме. 1.1м ловит только
// действительно один и тот же адрес (с учётом небольшого разброса
// геокодирования), а не "рядом, но другое место".
const SAME_PLACE_PRECISION = 5;

/** Координаты центра города через геокодер — с фолбэком на Тюмень, если геокодирование не удалось. */
async function geocodeCityCenter(city: string): Promise<[number, number]> {
  const suggestions = await searchAddress(city);
  const first = suggestions[0];
  return first ? [first.longitude, first.latitude] : DEFAULT_CENTER;
}

// Новые SVG-маркеры (viewBox 256×288, "кончик" пина на y≈269/288). Соответствие
// slug категории (см. supabase/migrations/0003_categories.sql) маркерам МЕСТО.
const MARKER_BY_SLUG: Record<string, string> = {
  training: "/brand/markers/marker-workout.svg",
  cinema: "/brand/markers/marker-movie.svg",
  coffee: "/brand/markers/marker-coffee.svg",
  breakfast: "/brand/markers/marker-breakfast.svg",
  dinner: "/brand/markers/marker-dinner.svg",
  walk: "/brand/markers/marker-walk.svg",
  custom: "/brand/markers/marker-custom.svg",
};
const FALLBACK_MARKER = "/brand/markers/marker-custom.svg";
const MARKER_ASPECT = 288 / 256; // высота/ширина viewBox маркера

/**
 * Круглый счётчик встреч — из пакета MESTO_MAP_CLUSTERS (cluster.css/.js):
 * белый круг, тёмная жирная цифра, фиолетово-оранжевая градиентная рамка,
 * мягкая тень. 52px обычно, 60px для трёх символов ("99+"). Инлайновые
 * стили вместо отдельного .css-класса — тот же подход, что уже
 * используется для остальных маркеров карты (el.style.cssText).
 */
function createClusterButton(count: number, onClick: () => void): HTMLButtonElement {
  const label = count > 99 ? "99+" : String(count);
  const isThreeChars = label.length >= 3;
  const size = isThreeChars ? 50 : 42;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", `Показать встречи: ${count}`);
  button.style.cssText = `
    box-sizing:border-box;width:${size}px;height:${size}px;border:3px solid transparent;
    border-radius:50%;
    background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#6c3bff,#8a5cff 45%,#ff8a2a) border-box;
    color:#111;font:800 ${isThreeChars ? 16 : 17}px/1 var(--font-onest),Onest,Arial,sans-serif;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 12px rgba(108,59,255,0.15);cursor:pointer;padding:0;
  `.replace(/\s+/g, " ");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

/** Группирует встречи по одному и тому же месту (см. SAME_PLACE_PRECISION) — каждая группа станет одной точкой для пространственной кластеризации, а внутри неё счётчик суммирует реальные встречи, а не места. */
function groupBySamePlace(events: MapEventItem[]): { latitude: number; longitude: number; events: MapEventItem[] }[] {
  const groups = new Map<string, MapEventItem[]>();
  for (const event of events) {
    const key = `${event.latitude.toFixed(SAME_PLACE_PRECISION)},${event.longitude.toFixed(SAME_PLACE_PRECISION)}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return Array.from(groups.values()).map((list) => {
    const first = list.find(() => true)!; // list всегда непустой — строится только через push
    return { latitude: first.latitude, longitude: first.longitude, events: list };
  });
}

export const EventsMap = forwardRef<EventsMapHandle, EventsMapProps>(function EventsMap(
  { events, onSelect, city },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const mapRef = useRef<{
    setLocation: (opts: { center?: [number, number]; zoom?: number; bounds?: [[number, number], [number, number]] }) => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    fitBounds(points) {
      if (!mapRef.current || points.length === 0) return;
      if (points.length === 1) {
        mapRef.current.setLocation({ center: points[0], zoom: 16 });
        return;
      }
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      mapRef.current.setLocation({
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
      });
    },
  }));

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      const ymaps3 = await loadYandexMaps();
      if (cancelled || !container) return;

      const { YMap, YMapDefaultSchemeLayer, YMapFeatureDataSource, YMapLayer, YMapMarker } = ymaps3 as unknown as {
        YMap: new (
          el: HTMLElement,
          opts: unknown
        ) => {
          addChild: (child: unknown) => unknown;
          setLocation: (opts: { center?: [number, number]; zoom?: number; bounds?: [[number, number], [number, number]] }) => void;
        };
        YMapDefaultSchemeLayer: new () => unknown;
        YMapFeatureDataSource: new (opts: { id: string }) => unknown;
        YMapLayer: new (opts: { source: string; type: string; zIndex: number }) => unknown;
        YMapMarker: new (opts: { coordinates: [number, number]; source: string }, el: HTMLElement) => unknown;
      };

      const center =
        events.length > 0
          ? ([
              events.reduce((sum, e) => sum + e.longitude, 0) / events.length,
              events.reduce((sum, e) => sum + e.latitude, 0) / events.length,
            ] as [number, number])
          : city
            ? await geocodeCityCenter(city)
            : DEFAULT_CENTER;
      if (cancelled) return;

      const map = new YMap(container, { location: { center, zoom: 12 } });
      mapRef.current = map;
      map.addChild(new YMapDefaultSchemeLayer());
      map.addChild(new YMapFeatureDataSource({ id: "events-source" }));
      map.addChild(new YMapLayer({ source: "events-source", type: "markers", zIndex: 1800 }));

      if (events.length === 0) return;

      const { YMapClusterer, clusterByGrid } = (await ymaps3.import("@yandex/ymaps3-clusterer")) as unknown as {
        YMapClusterer: new (props: Record<string, unknown>) => unknown;
        clusterByGrid: (opts: { gridSize: number }) => unknown;
      };
      if (cancelled) return;

      // Шаг 1 — объединяем встречи одного и того же места (см.
      // groupBySamePlace) — так они остаются одним счётчиком даже на
      // максимальном увеличении, когда пиксельная дистанция между ними
      // могла бы разойтись за порог кластеризации.
      const placeGroups = groupBySamePlace(events);

      const features = placeGroups.map((group, index) => ({
        type: "Feature" as const,
        id: `place-${index}`,
        geometry: { coordinates: [group.longitude, group.latitude] as [number, number] },
        properties: { events: group.events },
      }));

      function markerRenderer(feature: (typeof features)[number]) {
        const groupEvents = feature.properties.events;
        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;";

        if (groupEvents.length > 1) {
          // Несколько встреч по одному месту — счётчик, а не булавка,
          // даже если это единственная "точка" в своей ячейке сетки.
          const button = createClusterButton(groupEvents.length, () => onSelectRef.current(groupEvents));
          el.appendChild(button);
        } else {
          const event = groupEvents.find(() => true); // здесь всегда ровно 1 элемент (см. условие выше)
          if (!event) return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
          const src = MARKER_BY_SLUG[event.category?.slug ?? ""] ?? FALLBACK_MARKER;
          const width = 40;
          const height = Math.round(width * MARKER_ASPECT);
          el.style.cssText += `position:relative;width:${width}px;height:${height}px;transition:transform 200ms ease;transform-origin:bottom center;`;
          el.innerHTML = `<img src="${src}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
          el.addEventListener("click", () => onSelectRef.current([event]));
        }

        return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
      }

      function clusterRenderer(coordinates: [number, number], clusterFeatures: typeof features) {
        // Счётчик кластера — сумма РЕАЛЬНЫХ встреч по всем местам внутри
        // него, а не число мест (п.2 и п.8 задания на кластеризацию).
        const allEvents = clusterFeatures.flatMap((f) => f.properties.events);
        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;";
        const button = createClusterButton(allEvents.length, () => onSelectRef.current(allEvents));
        el.appendChild(button);
        return new YMapMarker({ coordinates, source: "events-source" }, el);
      }

      const clusterer = new YMapClusterer({
        method: clusterByGrid({ gridSize: CLUSTER_GRID_SIZE }),
        features,
        marker: markerRenderer,
        cluster: clusterRenderer,
      });

      map.addChild(clusterer);
    }

    setup();

    return () => {
      cancelled = true;
      mapRef.current = null;
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, city]);

  return <div ref={containerRef} className="h-full w-full" />;
});
ENDOFFILE

mkdir -p "app/(app)/map"
cat > "app/(app)/map/page.tsx" << 'ENDOFFILE'
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
    // Тот же порог "одно место", что и в EventsMap.tsx (SAME_PLACE_PRECISION) —
    // 5 знаков ≈ 1.1м, иначе кнопка "Приблизить" могла бы не появиться для
    // кластера из объединённых по ошибке разных соседних зданий.
    const keys = new Set(selected.map((e) => `${e.latitude.toFixed(5)},${e.longitude.toFixed(5)}`));
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
ENDOFFILE

