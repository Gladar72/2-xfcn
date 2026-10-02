"use client";

import { openRoute } from "@/lib/maps/route";

/**
 * Кнопка «Маршрут ↗» — открывает маршрут до места встречи в Яндекс Картах.
 * Используется поверх карты/фото на странице встречи и в списке встреч на карте.
 */
export function RouteButton({
  latitude,
  longitude,
  className = "",
}: {
  latitude: number;
  longitude: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openRoute(latitude, longitude);
      }}
      className={`rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink-900 shadow-card active:scale-95 ${className}`}
    >
      Маршрут ↗
    </button>
  );
}
