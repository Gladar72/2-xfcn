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
// (CLUSTER_GRID_SIZE) — и стандартная пиксельная кластеризация сама
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
  custom: "/brand/markers/marker-custom.svg",
};
const FALLBACK_MARKER = "/brand/markers/marker-custom.svg";
const MARKER_ASPECT = 288 / 256; // высота/ширина viewBox маркера
// "Своё предложение" (custom) — единственный маркер, где в самом файле
// цельная растровая картинка пина с заметным пустым полем по краям (у
// остальных категорий — векторный пин почти без полей + маленькая
// иконка внутри). При одинаковой рамке видимая часть пина у custom
// заметно мельче — компенсируем увеличенным размером именно для него.
const CUSTOM_MARKER_SCALE = 1.35;

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
        const only = points.find(() => true);
        if (only) mapRef.current.setLocation({ center: only, zoom: 16 });
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

      // Раздвигаем встречи с буквально одинаковыми координатами (см.
      // jitterExactDuplicates) — дальше обычная пиксельная кластеризация
      // сама решает, объединять их в кружок или показывать раздельно,
      // в зависимости от текущего масштаба карты.
      const jittered = jitterExactDuplicates(events);

      const features = jittered.map((event) => ({
        type: "Feature" as const,
        id: event.id,
        geometry: { coordinates: [event.longitude, event.latitude] as [number, number] },
        properties: { event },
      }));

      function markerRenderer(feature: (typeof features)[number]) {
        const event = feature.properties.event;
        const el = document.createElement("div");
        const src = MARKER_BY_SLUG[event.category?.slug ?? ""] ?? FALLBACK_MARKER;
        const isCustom = src === FALLBACK_MARKER;
        const width = isCustom ? Math.round(46 * CUSTOM_MARKER_SCALE) : 46;
        const height = Math.round(width * MARKER_ASPECT);
        // "Кончик" пина в самой картинке — не у самого низа (y≈269 из 288
        // высоты viewBox), а чуть выше. Без явного сдвига библиотека карт
        // ставит ЛЕВЫЙ ВЕРХНИЙ угол элемента в точку координаты — из-за
        // этого пин визуально "съезжал" с адреса вместо того, чтобы точно
        // указывать на него своим кончиком.
        const tipRatioY = 269 / 288;
        el.style.cssText = `position:relative;width:${width}px;height:${height}px;cursor:pointer;transform:translate(-50%, -${(tipRatioY * 100).toFixed(2)}%);transform-origin:bottom center;`;
        el.innerHTML = `<img src="${src}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
        el.addEventListener("click", () => onSelectRef.current([event]));
        return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
      }

      function clusterRenderer(coordinates: [number, number], clusterFeatures: typeof features) {
        // Счётчик кластера — число встреч в нём на текущем масштабе (п.2
        // задания на кластеризацию — считаем встречи, не участников).
        const allEvents = clusterFeatures.map((f) => f.properties.event);
        const el = document.createElement("div");
        // display:inline-block — обёртка сжимается по размеру кружка
        // внутри (без этого div растянулся бы на всю ширину контейнера,
        // и центрирование по проценту считалось бы неверно). translate
        // -50%/-50% — центр кружка (не левый верхний угол) точно на
        // координате.
        el.style.cssText = "display:inline-block;cursor:pointer;transform:translate(-50%, -50%);";
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
