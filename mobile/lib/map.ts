/**
 * Бесплатная карта: MapLibre (открытая библиотека) + тайлы OpenFreeMap (данные OpenStreetMap).
 * Без ключа и без лимитов — та же карта, что на сайте (lib/maps/load-maplibre.ts).
 * Google Maps и Яндекс MapKit не используем: первый требует платёжный аккаунт,
 * второй бесплатен только для бесплатных приложений до 1000 человек в день.
 */
import type { LngLat } from "@maplibre/maplibre-react-native";

// Светлая, почти монохромная — фото-булавки встреч на ней читаются лучше.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export const TYUMEN_CENTER: LngLat = [65.534, 57.153];
