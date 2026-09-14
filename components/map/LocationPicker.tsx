"use client";

import { useEffect, useRef, useState } from "react";
import { loadYandexMaps } from "@/lib/maps/load-yandex-maps";

interface LocationPickerProps {
  initialCenter?: [number, number]; // [lng, lat]
  onPick: (coords: { latitude: number; longitude: number }) => void;
}

const DEFAULT_CENTER: [number, number] = [65.534328, 57.152985]; // Тюмень

export function LocationPicker({ initialCenter, onPick }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [hasPin, setHasPin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      const ymaps3 = await loadYandexMaps();
      if (cancelled || !container) return;

      const { YMap, YMapDefaultSchemeLayer, YMapFeatureDataSource, YMapLayer, YMapMarker, YMapListener } =
        ymaps3 as unknown as {
          YMap: new (el: HTMLElement, opts: unknown) => { addChild: (c: unknown) => unknown };
          YMapDefaultSchemeLayer: new () => unknown;
          YMapFeatureDataSource: new (opts: { id: string }) => unknown;
          YMapLayer: new (opts: { source: string; type: string; zIndex: number }) => unknown;
          YMapMarker: new (opts: { coordinates: [number, number]; source: string }, el: HTMLElement) => unknown;
          YMapListener: new (opts: {
            layer: string;
            onClick: (object: unknown, event: { coordinates: [number, number] }) => void;
          }) => unknown;
        };

      const map = new YMap(container, {
        location: { center: initialCenter ?? DEFAULT_CENTER, zoom: 14 },
      });
      map.addChild(new YMapDefaultSchemeLayer());
      map.addChild(new YMapFeatureDataSource({ id: "picker-source" }));
      map.addChild(new YMapLayer({ source: "picker-source", type: "markers", zIndex: 1800 }));

      let markerEntity: { update?: (props: unknown) => void } | null = null;

      map.addChild(
        new YMapListener({
          layer: "any",
          onClick: (_object, event) => {
            const [longitude, latitude] = event.coordinates;
            setHasPin(true);
            onPickRef.current({ latitude, longitude });

            if (markerEntity?.update) {
              markerEntity.update({ coordinates: event.coordinates });
            } else {
              const el = document.createElement("div");
              el.style.cssText = "width:32px;height:36px;transform:translateY(-18px);filter:drop-shadow(0 6px 10px rgba(90,65,150,0.3));";
              el.innerHTML = '<img src="/brand/markers/marker-custom.svg" alt="" width="32" height="36" style="display:block;width:100%;height:100%;" />';
              markerEntity = new YMapMarker(
                { coordinates: event.coordinates, source: "picker-source" },
                el
              ) as { update?: (props: unknown) => void };
              map.addChild(markerEntity);
            }
          },
        })
      );
    }

    setup();

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card shadow-card">
      <div ref={containerRef} className="min-h-[120px] w-full flex-1" />
      {!hasPin && (
        <p className="shrink-0 bg-white px-3 py-1.5 text-center text-xs text-ink-600">
          Нажми на карту, чтобы отметить место встречи
        </p>
      )}
    </div>
  );
}
