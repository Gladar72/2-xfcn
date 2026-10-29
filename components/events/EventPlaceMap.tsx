"use client";

import { useEffect, useRef, useState } from "react";
import { createMap, type MapLibreMap } from "@/lib/maps/load-maplibre";
import { openRoute as openRouteTo } from "@/lib/maps/route";
import { buildEventMarkerElement, type MapEventItem } from "@/components/map/EventsMap";

interface EventPlaceMapProps {
  latitude: number;
  longitude: number;
  /** Значок булавки — тот же, что у встречи на общей карте (категория / бизнес). */
  markerSrc: string;
  placeName: string | null;
  /** Картинка-заглушка, пока карта грузится или если не загрузилась. */
  fallbackSrc: string;
  /** Встреча целиком — тогда метка точно такая же, как на общей карте (фото/логотип в капле). */
  markerEvent?: MapEventItem;
  /** Нажатие на карту — открыть карту приложения с этой встречей. */
  onOpen: () => void;
}

/**
 * «Где встречаемся» вместо картинки категории на странице встречи:
 * небольшая светлая карта (как общая карта встреч) с булавкой в точке.
 * Карта неподвижная — это картинка-превью, а не второй навигатор;
 * нажатие открывает карту приложения с этой встречей, маршрут — кнопкой «Маршрут ↗» (внешние карты).
 */
export function EventPlaceMap({ latitude, longitude, markerSrc, placeName, fallbackSrc, markerEvent, onOpen }: EventPlaceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: MapLibreMap | null = null;
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    createMap(container, { center: [longitude, latitude], zoom: 15.5, style: "positron", ownAttribution: true })
      .then(({ maplibregl, map: created }) => {
        if (cancelled) {
          created.remove();
          return;
        }
        map = created;
        // Только картинка: без перетаскивания и зума, чтобы страница
        // нормально листалась пальцем поверх карты.
        const m = created as unknown as Record<string, { disable?: () => void } | undefined>;
        for (const h of ["dragPan", "scrollZoom", "boxZoom", "doubleClickZoom", "touchZoomRotate", "keyboard"]) m[h]?.disable?.();

        if (markerEvent) {
          // Та же метка, что на общей карте; нажатие уходит на всю карточку-карту.
          const { el, offsetY } = buildEventMarkerElement(markerEvent, onOpen);
          new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, offsetY] }).setLngLat([longitude, latitude]).addTo(created);
        } else {
          const pin = document.createElement("img");
          pin.src = markerSrc;
          pin.alt = "";
          pin.style.cssText = "width:54px;height:auto;display:block;filter:drop-shadow(0 6px 10px rgba(90,65,150,0.3));";
          new maplibregl.Marker({ element: pin, anchor: "bottom" }).setLngLat([longitude, latitude]).addTo(created);
        }
        created.once("load", () => !cancelled && setReady(true));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, markerSrc, markerEvent?.id, markerEvent?.markerPhoto]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      aria-label={`Место встречи на карте${placeName ? `: ${placeName}` : ""}`}
      className="relative block w-full cursor-pointer overflow-hidden text-left"
      // isolation — всё, что рисует карта, остаётся «под» карточкой организатора.
      style={{ aspectRatio: "1.4", borderRadius: "var(--m-radius)", background: "#F1EAFF", isolation: "isolate", zIndex: 0 }}
    >
      {/* Заглушка под картой — видна, пока тайлы грузятся или если карта не загрузилась. */}
      {(!ready || failed) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallbackSrc}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "contain", padding: 40 }}
        />
      )}
      {/* MapLibre вешает на контейнер карты свой класс с position: relative —
          поэтому позиционируем обёртку, а сама карта просто 100% × 100%. */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: ready && !failed ? 1 : 0, pointerEvents: "none" }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>
      {/* Атрибуция данных карты (лицензия OpenStreetMap) — мелко в верхнем левом углу,
          чтобы не наезжать на карточку организатора внизу. */}
      <span className="absolute left-3 top-3 rounded bg-white/70 px-1.5 py-0.5 text-[9px] leading-none text-ink-600">
        © OpenStreetMap
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openRouteTo(latitude, longitude);
        }}
        className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink-900 shadow-card"
      >
        Маршрут ↗
      </button>
    </div>
  );
}
