import * as Location from "expo-location";
import { api } from "./api";
import { RUSSIAN_CITIES } from "./cities";

/**
 * Город по геолокации для анкеты: спрашиваем разрешение, берём примерную точку,
 * находим название города на телефоне (а если телефон не умеет — через наш сервер)
 * и сверяем со списком городов «Места». null — не дали доступ или город не нашли.
 */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/^(г\.|город)\s*/, "").trim();
const BY_NORM = new Map(RUSSIAN_CITIES.map((c) => [norm(c), c]));

function match(text: string | null | undefined): string | null {
  if (!text) return null;
  const direct = BY_NORM.get(norm(text));
  if (direct) return direct;
  // В адресе с сервера город — одна из частей через запятую.
  for (const part of text.split(",")) {
    const hit = BY_NORM.get(norm(part));
    if (hit) return hit;
  }
  return null;
}

export type DetectResult = { city: string } | { error: "denied" | "not_found" };

export async function detectCity(): Promise<DetectResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return { error: "denied" };
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60e3 }).catch(() => null)) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    const { latitude, longitude } = pos.coords;
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      for (const p of places) {
        const c = match(p.city) ?? match(p.subregion) ?? match(p.district) ?? match(p.region);
        if (c) return { city: c };
      }
    } catch {
      /* на части Android без сервисов Google геокодера нет — спросим сервер */
    }
    const r = await api<{ address: string | null }>(`/api/geocode?lat=${latitude}&lng=${longitude}`, { auth: false }).catch(() => null);
    const c = match(r?.address);
    return c ? { city: c } : { error: "not_found" };
  } catch {
    return { error: "not_found" };
  }
}
