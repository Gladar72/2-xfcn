"use client";

import { useEffect, useRef, useState } from "react";
import { loadYandexMaps } from "@/lib/maps/load-yandex-maps";
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
  const mapRef = useRef<{ setLocation: (opts: { center: [number, number]; zoom: number }) => void; addChild: (c: unknown) => unknown } | null>(null);
  const markerRef = useRef<{ update?: (props: unknown) => void } | null>(null);
  const markerCtorRef = useRef<(new (opts: { coordinates: [number, number]; source: string }, el: HTMLElement) => unknown) | null>(null);
  const placeMarkerRef = useRef<((coords: [number, number]) => void) | null>(null);

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

      mapRef.current = map as unknown as { setLocation: (opts: { center: [number, number]; zoom: number }) => void; addChild: (c: unknown) => unknown };
      markerCtorRef.current = YMapMarker;

      function placeMarker(coordinates: [number, number]) {
        if (markerRef.current?.update) {
          markerRef.current.update({ coordinates });
        } else {
          // Пропорции разные у разных иконок — свой пин почти квадратный
          // (после обрезки полей ≈944×1229 ≈ h/w 1.3), у бизнес-пина 1:1.
          // Без этого расчёта картинка растягивалась бы в чужую пропорцию.
          const width = 32;
          const height = markerIconSrc.includes("marker-business") ? width : Math.round(width * (1229 / 944));
          const el = document.createElement("div");
          el.style.cssText = `width:${width}px;height:${height}px;transform:translateY(-${height / 2}px);filter:drop-shadow(0 6px 10px rgba(90,65,150,0.3));`;
          el.innerHTML = `<img src="${markerIconSrc}" alt="" width="${width}" height="${height}" style="display:block;width:100%;height:100%;" />`;
          markerRef.current = new YMapMarker({ coordinates, source: "picker-source" }, el) as {
            update?: (props: unknown) => void;
          };
          map.addChild(markerRef.current);
        }
      }
      placeMarkerRef.current = placeMarker;

      map.addChild(
        new YMapListener({
          layer: "any",
          onClick: (_object, event) => {
            const [longitude, latitude] = event.coordinates;
            setHasPin(true);
            onPickRef.current({ latitude, longitude });

            setResolvingAddress(true);
            reverseGeocode(latitude, longitude)
              .then((address) => {
                if (address) onAddressResolvedRef.current?.(address);
              })
              .finally(() => setResolvingAddress(false));

            placeMarker(event.coordinates);
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

  // Точка выбрана извне (человек ввёл адрес текстом и выбрал подсказку) —
  // перелетаем картой к ней и ставим тот же маркер, что и при клике.
  useEffect(() => {
    if (!externalCoords || !mapRef.current || !placeMarkerRef.current) return;
    const coords: [number, number] = [externalCoords.longitude, externalCoords.latitude];
    mapRef.current.setLocation({ center: coords, zoom: 16 });
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
