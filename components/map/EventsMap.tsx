"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createMap, type LngLat, type MapLibreMap, type MapLibreMarker } from "@/lib/maps/load-maplibre";
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
  isBusiness?: boolean;
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
const CLUSTER_RADIUS = 50;
// Начиная с этого масштаба встречи больше не объединяются в кружки —
// раздвинутые дубликаты (см. JITTER_METERS) видны отдельными значками.
const CLUSTER_MAX_ZOOM = 17;
// Точность округления координат, чтобы найти встречи в буквально одной
// точке (например, две встречи в одном и том же месте, выбранном через
// автодополнение адреса) — 6 знаков после запятой ≈ 0.1м, ловит только
// настоящие совпадения, не "рядом, но другое здание".
const EXACT_MATCH_PRECISION = 6;
// На сколько метров технически "раздвигаем" встречи с одинаковыми
// координатами по кругу вокруг общей точки. Маленькое смещение —
// на обычном масштабе карты (город, район) это меньше одного экранного
// пикселя, поэтому такие встречи по-прежнему видны одним кружком; но при
// максимальном увеличении карты то же самое расстояние в метрах
// превращается в десятки экранных пикселей — больше порога кластеризации
// (CLUSTER_RADIUS) — и стандартная пиксельная кластеризация сама
// естественно разводит их на отдельные значки. Раньше вместо этого
// применялось "жёсткое" объединение без раздвижения — по итогам
// тестирования пользователь явно попросил именно раздвигать при
// увеличении, а не держать одним кружком навсегда.
const JITTER_METERS = 4;
const METERS_PER_DEGREE_LAT = 111320;

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
  custom: "/brand/markers/marker-custom-proposal.png",
};
const FALLBACK_MARKER = "/brand/markers/marker-custom-proposal.png";

/** Та же иконка, что у маркера встречи на карте — для списка в нижней шторке. */
export function markerIconFor(event: Pick<MapEventItem, "isBusiness" | "category">): string {
  return event.isBusiness ? "/brand/markers/marker-business.png" : MARKER_BY_SLUG[event.category?.slug ?? ""] ?? FALLBACK_MARKER;
}
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

/**
 * Встречи с буквально одинаковыми координатами технически "раздвигаются"
 * по маленькому кругу (см. JITTER_METERS) — так стандартная пиксельная
 * кластеризация сама решает, показывать ли их одним кружком (на обычном
 * масштабе) или отдельными значками (при сильном увеличении), вместо
 * жёсткого правила "одно и то же место — всегда один кружок навсегда".
 */
function jitterExactDuplicates(events: MapEventItem[]): MapEventItem[] {
  const groups = new Map<string, MapEventItem[]>();
  for (const event of events) {
    const key = `${event.latitude.toFixed(EXACT_MATCH_PRECISION)},${event.longitude.toFixed(EXACT_MATCH_PRECISION)}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  const result: MapEventItem[] = [];
  for (const list of groups.values()) {
    const first = list.find(() => true);
    if (!first || list.length === 1) {
      if (first) result.push(first);
      continue;
    }
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((first.latitude * Math.PI) / 180);
    list.forEach((event, i) => {
      const angle = (2 * Math.PI * i) / list.length;
      const dLat = (JITTER_METERS * Math.sin(angle)) / METERS_PER_DEGREE_LAT;
      const dLng = (JITTER_METERS * Math.cos(angle)) / metersPerDegreeLng;
      result.push({ ...event, latitude: event.latitude + dLat, longitude: event.longitude + dLng });
    });
  }
  return result;
}

/** Размеры и «кончик» пина для HTML-маркера встречи (см. комментарии внутри). */
function buildEventMarkerElement(event: MapEventItem, onClick: () => void): { el: HTMLElement; offsetY: number } {
  // "Для бизнеса" — отдельный, чуть более крупный значок (маскот с
  // кошельком в булавке-геолокации).
  const src = markerIconFor(event);
  const isCustom = !event.isBusiness && src === FALLBACK_MARKER;
  const width = event.isBusiness ? 60 : 46;
  // marker-business.png — квадратный кадр (1:1); marker-custom-proposal.png —
  // своя пропорция (1229/944), у SVG-пинов категорий — 288/256.
  const height = event.isBusiness ? width : Math.round(width * (isCustom ? 1229 / 944 : MARKER_ASPECT));
  // "Кончик" пина — не у самого низа картинки: у SVG-пинов y≈269/288, у
  // бизнес-пина ≈95.2%, у своего предложения ≈99.3%. Маркер ставится
  // серединой нижнего края в точку, поэтому сдвигаем вниз на остаток.
  const tipRatioY = event.isBusiness ? 0.952 : isCustom ? 0.993 : 269 / 288;
  const el = document.createElement("div");
  el.style.cssText = `width:${width}px;height:${height}px;cursor:pointer;`;
  el.innerHTML = `<img src="${src}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return { el, offsetY: Math.round((1 - tipRatioY) * height) };
}

export const EventsMap = forwardRef<EventsMapHandle, EventsMapProps>(function EventsMap(
  { events, onSelect, city },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const mapRef = useRef<MapLibreMap | null>(null);

  useImperativeHandle(ref, () => ({
    fitBounds(points) {
      const map = mapRef.current;
      if (!map || points.length === 0) return;
      if (points.length === 1) {
        const only = points.find(() => true);
        if (only) map.flyTo({ center: only, zoom: 16 });
        return;
      }
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 60, maxZoom: 18 }
      );
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      const center: LngLat =
        events.length > 0
          ? [
              events.reduce((sum, e) => sum + e.longitude, 0) / events.length,
              events.reduce((sum, e) => sum + e.latitude, 0) / events.length,
            ]
          : city
            ? await geocodeCityCenter(city)
            : DEFAULT_CENTER;
      if (cancelled || !container) return;

      const created = await createMap(container, { center, zoom: 12 });
      if (cancelled) {
        created.map.remove();
        return;
      }
      const { maplibregl } = created;
      map = created.map;
      mapRef.current = map;
      const activeMap = map;

      if (events.length === 0) return;

      // Раздвигаем встречи с буквально одинаковыми координатами (см.
      // jitterExactDuplicates) — дальше обычная пиксельная кластеризация
      // сама решает, объединять их в кружок или показывать раздельно.
      const jittered = jitterExactDuplicates(events);
      const eventsById = new Map(jittered.map((e) => [e.id, e]));

      const geojson = {
        type: "FeatureCollection",
        features: jittered.map((event) => ({
          type: "Feature",
          properties: { id: event.id },
          geometry: { type: "Point", coordinates: [event.longitude, event.latitude] },
        })),
      };

      // HTML-маркеры (наши 3D-пины и кружки-счётчики) поверх кластеров,
      // которые считает сама карта. Ключ — id встречи или id кластера.
      const markers = new Map<string, MapLibreMarker>();

      function syncMarkers() {
        const seen = new Set<string>();
        for (const feature of activeMap.querySourceFeatures("events")) {
          const props = feature.properties ?? {};
          const coords = feature.geometry.coordinates as LngLat;
          if (props.cluster) {
            const clusterId = Number(props.cluster_id);
            const key = `c${clusterId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (markers.has(key)) continue;
            const count = Number(props.point_count);
            const button = createClusterButton(count, () => {
              const source = activeMap.getSource("events") as {
                getClusterLeaves: (id: number, limit: number, offset: number) => Promise<Array<{ properties: { id: string } }>>;
              };
              source
                .getClusterLeaves(clusterId, Infinity, 0)
                .then((leaves) => {
                  const list = leaves.map((l) => eventsById.get(l.properties.id)).filter((e): e is MapEventItem => !!e);
                  if (list.length > 0) onSelectRef.current(list);
                })
                .catch(() => {});
            });
            const marker = new maplibregl.Marker({ element: button, anchor: "center" }).setLngLat(coords).addTo(activeMap);
            markers.set(key, marker);
          } else {
            const id = String(props.id);
            const event = eventsById.get(id);
            if (!event || seen.has(id)) continue;
            seen.add(id);
            if (markers.has(id)) continue;
            const { el, offsetY } = buildEventMarkerElement(event, () => onSelectRef.current([event]));
            const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, offsetY] })
              .setLngLat([event.longitude, event.latitude])
              .addTo(activeMap);
            markers.set(id, marker);
          }
        }
        for (const [key, marker] of markers) {
          if (!seen.has(key)) {
            marker.remove();
            markers.delete(key);
          }
        }
      }

      activeMap.on("load", () => {
        if (cancelled) return;
        activeMap.addSource("events", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterRadius: CLUSTER_RADIUS,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
        });
        // Невидимый слой — без него карта не отдаёт точки источника
        // (querySourceFeatures), а рисуем мы их сами HTML-маркерами.
        activeMap.addLayer({
          id: "events-hidden",
          type: "circle",
          source: "events",
          paint: { "circle-radius": 1, "circle-opacity": 0 },
        });
        activeMap.on("data", (e: unknown) => {
          const ev = e as { sourceId?: string; isSourceLoaded?: boolean };
          if (ev.sourceId === "events" && ev.isSourceLoaded) syncMarkers();
        });
        activeMap.on("moveend", syncMarkers);
      });
    }

    setup().catch((err) => console.error("EventsMap: не удалось загрузить карту", err));

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, city]);

  return <div ref={containerRef} className="h-full w-full" />;
});
