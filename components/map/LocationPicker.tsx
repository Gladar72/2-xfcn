"use client";

import { useEffect, useRef, useState } from "react";
import { createMap, type LngLat, type MapLibreMap, type MapLibreMarker } from "@/lib/maps/load-maplibre";
import { reverseGeocode } from "@/lib/maps/reverse-geocode";

interface LocationPickerProps {
  initialCenter?: [number, number]; // [lng, lat]
  onPick: (coords: { latitude: number; longitude: number }) => void;
  /** Вызывается отдельно, как только адрес определится (может прийти
   * позже самого onPick — геокодирование асинхронное и не блокирует
   * основной поток выбора точки). */
  onAddressResolved?: (address: string) => void;
  /**
   * Координаты, выбранные НЕ кликом по карте — например, пользователь
   * сам ввёл адрес и выбрал вариант из подсказки (см. AddressAutocomplete
   * в CreateEventWizard). При изменении карта сама перелетает к точке и
   * ставит маркер, как будто там кликнули.
   */
  externalCoords?: { latitude: number; longitude: number } | null;
  /**
   * Явная высота карты в пикселях — задаётся родителем (обычно как доля
   * от высоты экрана). Без неё карта полагается на flex/min-h и на деле
   * может оказаться заметно меньше, чем кажется по вёрстке.
   */
  heightPx?: number;
  /** Иконка маркера — своя для "Для бизнеса" (см. явное уточнение
   * пользователя: значок выбора места должен меняться вместе с типом
   * события), по умолчанию — обычный пин "Своё предложение". */
  markerIconSrc?: string;
}

const DEFAULT_CENTER: [number, number] = [65.534328, 57.152985]; // Тюмень
const DEFAULT_MARKER_ICON = "/brand/markers/marker-custom-proposal.png";

export function LocationPicker({
  initialCenter,
  onPick,
  onAddressResolved,
  externalCoords,
  heightPx,
  markerIconSrc = DEFAULT_MARKER_ICON,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onAddressResolvedRef = useRef(onAddressResolved);
  onAddressResolvedRef.current = onAddressResolved;
  const [hasPin, setHasPin] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const mapRef = useRef<MapLibreMap | null>(null);
  const placeMarkerRef = useRef<((coords: LngLat) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const container = containerRef.current;
    if (!container) return;

    async function setup() {
      if (!container) return;
      const created = await createMap(container, { center: initialCenter ?? DEFAULT_CENTER, zoom: 14 });
      if (cancelled) {
        created.map.remove();
        return;
      }
      const { maplibregl } = created;
      map = created.map;
      mapRef.current = map;
      const activeMap = map;
      let marker: MapLibreMarker | null = null;

      function placeMarker(coordinates: LngLat) {
        if (marker) {
          marker.setLngLat(coordinates);
          return;
        }
        // Пропорции разные у разных иконок — свой пин почти квадратный
        // (≈944×1229), у бизнес-пина 1:1. Кончик пина — у нижнего края.
        const width = 32;
        const height = markerIconSrc.includes("marker-business") ? width : Math.round(width * (1229 / 944));
        const el = document.createElement("div");
        el.style.cssText = `width:${width}px;height:${height}px;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.3));`;
        el.innerHTML = `<img src="${markerIconSrc}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;" />`;
        marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(coordinates).addTo(activeMap);
      }
      placeMarkerRef.current = placeMarker;

      activeMap.on("click", (e: unknown) => {
        const { lng: longitude, lat: latitude } = (e as { lngLat: { lng: number; lat: number } }).lngLat;
        setHasPin(true);
        onPickRef.current({ latitude, longitude });

        setResolvingAddress(true);
        reverseGeocode(latitude, longitude)
          .then((address) => {
            if (address) onAddressResolvedRef.current?.(address);
          })
          .finally(() => setResolvingAddress(false));

        placeMarker([longitude, latitude]);
      });
    }

    setup().catch((err) => console.error("LocationPicker: не удалось загрузить карту", err));

    return () => {
      cancelled = true;
      mapRef.current = null;
      placeMarkerRef.current = null;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Точка выбрана извне (человек ввёл адрес текстом и выбрал подсказку) —
  // перелетаем картой к ней и ставим тот же маркер, что и при клике.
  useEffect(() => {
    if (!externalCoords || !mapRef.current || !placeMarkerRef.current) return;
    const coords: LngLat = [externalCoords.longitude, externalCoords.latitude];
    mapRef.current.flyTo({ center: coords, zoom: 16 });
    placeMarkerRef.current(coords);
    setHasPin(true);
  }, [externalCoords]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card shadow-card">
      <div
        ref={containerRef}
        className="w-full flex-1"
        style={heightPx ? { height: heightPx, minHeight: heightPx } : { minHeight: 280 }}
      />
      {!hasPin && (
        <p className="shrink-0 bg-white px-3 py-1.5 text-center text-xs text-ink-600">
          Нажми на карту, чтобы отметить место встречи
        </p>
      )}
      {resolvingAddress && (
        <p className="shrink-0 bg-white px-3 py-1.5 text-center text-xs text-ink-400">Определяем адрес...</p>
      )}
    </div>
  );
}
