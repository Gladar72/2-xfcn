mkdir -p "components/map"
cat > "components/map/EventsMap.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef } from "react";
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

/** Координаты центра города через геокодер — с фолбэком на Тюмень, если геокодирование не удалось. */
async function geocodeCityCenter(city: string): Promise<[number, number]> {
  const suggestions = await searchAddress(city);
  const first = suggestions[0];
  return first ? [first.longitude, first.latitude] : DEFAULT_CENTER;
}

// Новые SVG-маркеры (viewBox 256×288, "кончик" пина на y≈269/288 — см.
// CLAUDE_INTEGRATION.md из пакета ассетов). Соответствие slug категории
// (см. supabase/migrations/0003_categories.sql) маркерам МЕСТО.
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

export function EventsMap({ events, onSelect, city }: EventsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      const ymaps3 = await loadYandexMaps();
      if (cancelled || !container) return;

      const { YMap, YMapDefaultSchemeLayer, YMapFeatureDataSource, YMapLayer, YMapMarker } = ymaps3 as unknown as {
        YMap: new (el: HTMLElement, opts: unknown) => { addChild: (child: unknown) => unknown };
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
      map.addChild(new YMapDefaultSchemeLayer());
      map.addChild(new YMapFeatureDataSource({ id: "events-source" }));
      map.addChild(new YMapLayer({ source: "events-source", type: "markers", zIndex: 1800 }));

      if (events.length === 0) return;

      const { YMapClusterer, clusterByGrid } = (await ymaps3.import("@yandex/ymaps3-clusterer")) as unknown as {
        YMapClusterer: new (props: Record<string, unknown>) => unknown;
        clusterByGrid: (opts: { gridSize: number }) => unknown;
      };
      if (cancelled) return;

      const features = events.map((event) => ({
        type: "Feature" as const,
        id: event.id,
        geometry: { coordinates: [event.longitude, event.latitude] as [number, number] },
        properties: { event },
      }));

      function markerRenderer(feature: (typeof features)[number]) {
        const el = document.createElement("div");
        const src = MARKER_BY_SLUG[feature.properties.event.category?.slug ?? ""] ?? FALLBACK_MARKER;
        const width = 40;
        const height = Math.round(width * MARKER_ASPECT);
        el.style.cssText =
          `position:relative;width:${width}px;height:${height}px;cursor:pointer;transition:transform 200ms ease;transform-origin:bottom center;`;
        el.innerHTML = `<img src="${src}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
        el.addEventListener("click", () => onSelectRef.current([feature.properties.event]));
        return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
      }

      function clusterRenderer(
        coordinates: [number, number],
        clusterFeatures: typeof features
      ) {
        // Контейнер кластера из нового пакета ассетов + настоящее число поверх
        // (см. CLAUDE_INTEGRATION.md п.9 — рендерить число отдельным слоем, а не
        // вписывать в саму картинку).
        const width = 40;
        const height = Math.round(width * MARKER_ASPECT);
        const el = document.createElement("div");
        el.style.cssText = `position:relative;width:${width}px;height:${height}px;cursor:pointer;`;
        el.innerHTML = `
          <img src="/brand/markers/marker-cluster.svg" alt="" width="${width}" height="${height}"
            style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />
          <span style="position:absolute;left:0;top:0;width:100%;height:${Math.round(width * 0.85)}px;
            display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">
            ${clusterFeatures.length}
          </span>`;
        el.addEventListener("click", () =>
          onSelectRef.current(clusterFeatures.map((f) => f.properties.event))
        );
        return new YMapMarker({ coordinates, source: "events-source" }, el);
      }

      const clusterer = new YMapClusterer({
        method: clusterByGrid({ gridSize: 64 }),
        features,
        marker: markerRenderer,
        cluster: clusterRenderer,
      });

      map.addChild(clusterer);
    }

    setup();

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, city]);

  return <div ref={containerRef} className="h-full w-full" />;
}
ENDOFFILE

mkdir -p "app/(app)/map"
cat > "app/(app)/map/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EventsMap, type MapEventItem } from "@/components/map/EventsMap";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="relative h-[calc(100vh-5rem)]">
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
        <EventsMap events={events} onSelect={setSelected} city={searchParams.get("city") ?? undefined} />
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-20 z-50 max-h-[50vh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-card">
          <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" onClick={() => setSelected(null)} />
          <h2 className="text-title mb-3 truncate">
            {selected[0]?.placeName || selected[0]?.address || "Место встречи"}
          </h2>
          <div className="space-y-2">
            {selected.map((event) => (
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
                    {event.placeName ? ` · ${event.placeName}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
ENDOFFILE

