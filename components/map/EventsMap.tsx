"use client";

import { useEffect, useRef } from "react";
import { loadYandexMaps } from "@/lib/maps/load-yandex-maps";

export interface MapEventItem {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  latitude: number;
  longitude: number;
  placeName: string | null;
  seatsLeft: number;
  category: { slug: string; name: string; emoji: string | null } | null;
}

interface EventsMapProps {
  events: MapEventItem[];
  onSelect: (events: MapEventItem[]) => void;
}

const DEFAULT_CENTER: [number, number] = [65.534328, 57.152985]; // Тюмень, запасной центр

// Соответствие slug категории (см. supabase/migrations/0003_categories.sql) фирменным 3D-маркерам МЕСТО.
const MARKER_BY_SLUG: Record<string, string> = {
  training: "/brand/markers/marker-workout.png",
  cinema: "/brand/markers/marker-movie.png",
  coffee: "/brand/markers/marker-coffee.png",
  breakfast: "/brand/markers/marker-breakfast.png",
  dinner: "/brand/markers/marker-dinner.png",
  walk: "/brand/markers/marker-walk.png",
  custom: "/brand/markers/marker-custom.png",
};
const FALLBACK_MARKER = "/brand/markers/marker-custom.png";

export function EventsMap({ events, onSelect }: EventsMapProps) {
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
          : DEFAULT_CENTER;

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
        el.style.cssText =
          "display:flex;align-items:flex-end;justify-content:center;width:44px;height:56px;cursor:pointer;transition:transform 200ms ease;transform-origin:bottom center;";
        el.innerHTML = `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.25));" />`;
        el.addEventListener("click", () => onSelectRef.current([feature.properties.event]));
        return new YMapMarker({ coordinates: feature.geometry.coordinates, source: "events-source" }, el);
      }

      function clusterRenderer(
        coordinates: [number, number],
        clusterFeatures: typeof features
      ) {
        // Белый круглый бейдж с мягкой тенью (см. бриф п.35) — не фирменный цвет,
        // чтобы не спорить визуально с самими маркерами.
        const el = document.createElement("div");
        el.style.cssText =
          "display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:#FFFFFF;color:#111111;font-weight:700;font-size:15px;box-shadow:0 6px 16px rgba(90,65,150,0.18);cursor:pointer;";
        el.textContent = String(clusterFeatures.length);
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
  }, [events]);

  return <div ref={containerRef} className="h-full w-full" />;
}
