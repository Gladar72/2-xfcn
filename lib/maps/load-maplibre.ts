"use client";

/**
 * Бесплатная карта: MapLibre GL JS (открытая библиотека) + векторные тайлы
 * OpenFreeMap (данные OpenStreetMap). Без ключа и без суточных лимитов —
 * заменила Яндекс JavaScript API, у которого на бесплатном тарифе всего
 * 100 загрузок карты в сутки на всё приложение (платно — от 41 600 ₽/мес).
 *
 * Поиск адреса (геокодер) по-прежнему идёт через Яндекс — см. /api/geocode.
 *
 * Библиотеку грузим с CDN при первом открытии карты (как раньше Яндекс),
 * а не через npm — так она не утяжеляет остальные экраны приложения.
 */

const MAPLIBRE_VERSION = "4.7.1";
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const MAP_STYLE_URLS = {
  liberty: "https://tiles.openfreemap.org/styles/liberty",
  // Светлая, почти монохромная — фото-булавки встреч на ней читаются лучше (как у Invitor).
  positron: "https://tiles.openfreemap.org/styles/positron",
} as const;
export type MapStyleName = keyof typeof MAP_STYLE_URLS;

// Минимальные типы — ровно то, что используется в компонентах карты.
export type LngLat = [number, number];

export interface MapLibreMarker {
  setLngLat: (lngLat: LngLat) => MapLibreMarker;
  addTo: (map: MapLibreMap) => MapLibreMarker;
  remove: () => void;
}

export interface MapLibreMap {
  on: (event: string, ...args: unknown[]) => void;
  once: (event: string, cb: () => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => unknown;
  querySourceFeatures: (sourceId: string) => Array<{
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown> | null;
  }>;
  isSourceLoaded: (id: string) => boolean;
  flyTo: (opts: { center: LngLat; zoom?: number }) => void;
  easeTo: (opts: { center: LngLat; zoom?: number }) => void;
  fitBounds: (bounds: [LngLat, LngLat], opts?: { padding?: number; maxZoom?: number }) => void;
  getZoom: () => number;
  zoomIn: () => void;
  zoomOut: () => void;
  remove: () => void;
  resize: () => void;
}

export interface MapLibreNamespace {
  Map: new (opts: Record<string, unknown>) => MapLibreMap;
  Marker: new (opts: { element: HTMLElement; anchor?: string; offset?: [number, number] }) => MapLibreMarker;
  AttributionControl: new (opts?: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    maplibregl?: MapLibreNamespace;
  }
}

let libPromise: Promise<MapLibreNamespace> | null = null;
const stylePromises: Partial<Record<MapStyleName, Promise<Record<string, unknown>>>> = {};

function loadCss() {
  if (document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS;
  document.head.appendChild(link);
}

export function loadMapLibre(): Promise<MapLibreNamespace> {
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    loadCss();
    if (window.maplibregl) {
      resolve(window.maplibregl);
      return;
    }
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS;
    script.async = true;
    script.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("maplibregl не загрузился")));
    script.onerror = () => {
      libPromise = null;
      reject(new Error("Не удалось загрузить MapLibre"));
    };
    document.head.appendChild(script);
  });
  return libPromise;
}

/**
 * Стиль карты OpenFreeMap с русскими подписями. По умолчанию стиль пишет
 * названия в виде «Tyumen Тюмень» (латиница + оригинал) — заменяем на
 * русское название, а если его нет — на местное.
 */
export function loadMapStyle(name: MapStyleName = "liberty"): Promise<Record<string, unknown>> {
  const cached = stylePromises[name];
  if (cached) return cached;
  const promise = fetch(MAP_STYLE_URLS[name])
    .then((r) => {
      if (!r.ok) throw new Error(`style ${r.status}`);
      return r.json() as Promise<Record<string, unknown>>;
    })
    .then((style) => {
      const layers = (style.layers as Array<{ layout?: Record<string, unknown> }> | undefined) ?? [];
      for (const layer of layers) {
        if (layer.layout && "text-field" in layer.layout) {
          layer.layout["text-field"] = ["coalesce", ["get", "name:ru"], ["get", "name:nonlatin"], ["get", "name"]];
        }
      }
      return style;
    })
    .catch((err) => {
      delete stylePromises[name];
      throw err;
    });
  stylePromises[name] = promise;
  return promise;
}

export async function createMap(
  container: HTMLElement,
  opts: { center: LngLat; zoom: number; style?: MapStyleName; /** Своя подпись © OpenStreetMap вместо кнопки «i» (маленькие превью карты). */ ownAttribution?: boolean }
): Promise<{ maplibregl: MapLibreNamespace; map: MapLibreMap }> {
  const [maplibregl, style] = await Promise.all([loadMapLibre(), loadMapStyle(opts.style)]);
  const map = new maplibregl.Map({
    container,
    style,
    center: opts.center,
    zoom: opts.zoom,
    attributionControl: false,
    // Карта внутри Telegram: наклон и поворот двумя пальцами только мешают.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  // Атрибуция OpenStreetMap обязательна по лицензии данных — компактная кнопка «i».
  if (!opts.ownAttribution) {
    (map as unknown as { addControl: (c: unknown, pos?: string) => void }).addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );
  }
  (map as unknown as { touchZoomRotate?: { disableRotation?: () => void } }).touchZoomRotate?.disableRotation?.();
  return { maplibregl, map };
}
